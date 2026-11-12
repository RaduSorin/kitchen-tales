import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Salvează în Bucătăria" in the Share sheet: reads the shared link, text or photo and shows the
/// import card over the app it came from (ShareCardView, shared with the main app).
final class ShareViewController: UIViewController {
    private var host: UIHostingController<AnyView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        Task { await show() }
    }

    private func show() async {
        guard let input = await Self.readInput(extensionContext) else {
            close()
            return
        }
        let model = ShareCardModel(input: input)
        let card = ShareCardView(model: model, onClose: { [weak self] in self?.close() },
                                 onOpenRecipe: { [weak self] id in self?.openApp("kitchentales://recipe/\(id)") })
        let host = UIHostingController(rootView: AnyView(card))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        self.host = host
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// Share extensions may not open URLs directly; the app's UIApplication up the responder chain can.
    private func openApp(_ link: String) {
        guard let url = URL(string: link) else { return }
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if current is UIApplication, current.responds(to: selector) {
                typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
                let open = unsafeBitCast(current.method(for: selector), to: Open.self)
                open(current, selector, url as NSURL, NSDictionary(), nil)
                break
            }
            responder = current.next
        }
        close()
    }

    /// The first link, text or image among the shared items (a link inside text counts as the link).
    private static func readInput(_ context: NSExtensionContext?) async -> ShareInput? {
        let providers = (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if case .url(let url)? = await p.ktLoad(.url), url.scheme?.hasPrefix("http") == true { return .link(url) }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            if case .data(let data)? = await p.ktLoad(.image) { return .image(data) }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if case .text(let text)? = await p.ktLoad(.plainText), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return ShareInput.from(text: text)
            }
        }
        return nil
    }
}

/// A shared item, read out of its provider while the system still allows it.
private enum Loaded: Sendable {
    case url(URL)
    case data(Data)
    case text(String)
}

private extension NSItemProvider {
    func ktLoad(_ type: UTType) async -> Loaded? {
        await withCheckedContinuation { done in
            loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                let value: Loaded?
                if let url = item as? URL {
                    // A photo comes as a file that may only be read here.
                    value = url.isFileURL ? (try? Data(contentsOf: url)).map(Loaded.data) : .url(url)
                } else if let data = item as? Data {
                    value = type == .plainText ? String(data: data, encoding: .utf8).map(Loaded.text) : .data(data)
                } else if let text = item as? String {
                    value = .text(text)
                } else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                    value = .data(data)
                } else {
                    value = nil
                }
                done.resume(returning: value)
            }
        }
    }
}
