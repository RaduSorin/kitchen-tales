import CoreText
import SwiftUI
import UIKit

/// "Caietul de rețete": every recipe (or the favourites) in a PDF made on the phone, A5 or A4,
/// light paper or the evening style, with or without photos; sent from the share sheet.
struct CookbookSheet: View {
    @Environment(RecipeStore.self) private var store
    @Environment(AuthModel.self) private var auth
    @Environment(ProfileStore.self) private var profile
    @Environment(\.dismiss) private var dismiss
    @State private var favoritesOnly = false
    @State private var evening = false
    @State private var a4 = false
    @State private var photos = true
    @State private var making = false
    @State private var file: URL?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Ce intră", selection: $favoritesOnly) {
                        Text("Toate · \(store.recipes.count)").tag(false)
                        Text("Favorite · \(favorites.count)").tag(true)
                    }
                    Picker("Stil", selection: $evening) {
                        Text("Clasic").tag(false)
                        Text("Seară").tag(true)
                    }
                    Picker("Mărime", selection: $a4) {
                        Text("A5").tag(false)
                        Text("A4").tag(true)
                    }
                    Picker("Poze", selection: $photos) {
                        Text("Cu poze").tag(true)
                        Text("Fără poze").tag(false)
                    }
                } footer: {
                    Text(error ?? "Pozele se iau de pe server; fără internet caietul iese fără ele.")
                }
                .listRowBackground(Theme.surface)
                Section {
                    if let file {
                        ShareLink(item: file) { Label("Partajează caietul", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.ktPrimaryWide)
                    } else {
                        Button { make() } label: {
                            if making { ProgressView().tint(Theme.onAccent) } else { Text("Creează PDF-ul") }
                        }
                        .buttonStyle(.ktPrimaryWide)
                        .disabled(making || chosen.isEmpty)
                    }
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Caietul de rețete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Închide") { dismiss() } } }
            .onChange(of: [favoritesOnly, evening, a4, photos]) { file = nil }
        }
        .presentationDetents([.medium, .large])
    }

    private var favorites: [Recipe] { store.recipes.filter { store.isFavorite($0.id) } }
    private var chosen: [Recipe] {
        (favoritesOnly ? favorites : store.recipes).sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }

    private var authors: String {
        let me = auth.account?.displayName ?? ""
        let others = profile.members.filter { $0.sameSpace && $0.email.lowercased() != auth.account?.email?.lowercased() }.map(\.name)
        let names = ([me] + others).filter { !$0.isEmpty }
        if names.count < 2 { return names.first ?? "" }
        return names.dropLast().joined(separator: ", ") + " și " + names.last!
    }

    private func make() {
        making = true
        error = nil
        let recipes = chosen
        Task {
            var images: [String: UIImage] = [:]
            if photos {
                for r in recipes {
                    if let demo = r.demoPhoto, let image = DemoPhotos.image(demo) { images[r.id] = image; continue }
                    guard let key = r.photoKey, let links = store.links, let url = await links.url(for: key, ref: r.fileRef),
                          let reply = try? await URLSession.shared.data(from: url), let image = UIImage(data: reply.0) else { continue }
                    images[r.id] = image
                }
            }
            let book = Cookbook(recipes: recipes, images: images, authors: authors, evening: evening, a4: a4)
            do {
                file = try book.write()
                Haptics.success()
            } catch {
                self.error = "Nu am putut face PDF-ul: \(error.localizedDescription)"
            }
            making = false
        }
    }
}

/// Lays the cookbook out: a cover, then each recipe from a new page (photo, title, details,
/// ingredients, steps), the text flowing onto further pages when long.
@MainActor
struct Cookbook {
    let recipes: [Recipe]
    let images: [String: UIImage]
    let authors: String
    let evening: Bool
    let a4: Bool

    private var page: CGRect { a4 ? CGRect(x: 0, y: 0, width: 595, height: 842) : CGRect(x: 0, y: 0, width: 420, height: 595) }
    private var margin: CGFloat { a4 ? 54 : 38 }
    private var scale: CGFloat { a4 ? 1.2 : 1 }
    private var paper: UIColor { evening ? UIColor(red: 0.075, green: 0.063, blue: 0.055, alpha: 1) : UIColor(red: 0.99, green: 0.97, blue: 0.93, alpha: 1) }
    private var ink: UIColor { evening ? UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1) : UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 1) }
    private var soft: UIColor { evening ? UIColor(red: 0.66, green: 0.62, blue: 0.58, alpha: 1) : UIColor(red: 0.45, green: 0.39, blue: 0.33, alpha: 1) }
    private var gold: UIColor { evening ? UIColor(red: 0.95, green: 0.78, blue: 0.47, alpha: 1) : UIColor(red: 0.62, green: 0.42, blue: 0.16, alpha: 1) }

    func write() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Rețetele noastre.pdf")
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Rețetele noastre", kCGPDFContextAuthor as String: authors]
        let renderer = UIGraphicsPDFRenderer(bounds: page, format: format)
        try renderer.writePDF(to: url) { ctx in
            cover(ctx)
            for r in recipes { recipe(r, ctx) }
        }
        return url
    }

    private func display(_ size: CGFloat) -> UIFont { UIFont(name: AppFont.display, size: size * scale) ?? .systemFont(ofSize: size * scale, weight: .semibold) }
    private func body(_ size: CGFloat, bold: Bool = false) -> UIFont {
        UIFont(name: bold ? AppFont.bodySemibold : AppFont.body, size: size * scale) ?? .systemFont(ofSize: size * scale, weight: bold ? .semibold : .regular)
    }

    private func fill(_ ctx: UIGraphicsPDFRendererContext) {
        ctx.beginPage()
        paper.setFill()
        ctx.fill(page)
    }

    private func cover(_ ctx: UIGraphicsPDFRendererContext) {
        fill(ctx)
        let center = NSMutableParagraphStyle()
        center.alignment = .center
        let title = NSAttributedString(string: "Rețetele noastre", attributes: [.font: display(34), .foregroundColor: ink, .paragraphStyle: center])
        let line = NSAttributedString(string: [authors.isEmpty ? nil : "de \(authors)", "\(recipes.count) rețete"].compactMap { $0 }.joined(separator: " · "),
                                      attributes: [.font: body(12), .foregroundColor: soft, .paragraphStyle: center])
        let year = NSAttributedString(string: "\(Calendar.current.component(.year, from: Date()))", attributes: [.font: body(11, bold: true), .foregroundColor: gold, .paragraphStyle: center, .kern: 2])
        let w = page.width - margin * 2
        title.draw(in: CGRect(x: margin, y: page.height * 0.38, width: w, height: 120 * scale))
        line.draw(in: CGRect(x: margin, y: page.height * 0.38 + 60 * scale, width: w, height: 40 * scale))
        year.draw(in: CGRect(x: margin, y: page.height - margin - 20 * scale, width: w, height: 20 * scale))
        gold.setStroke()
        let rule = UIBezierPath()
        rule.move(to: CGPoint(x: page.midX - 30, y: page.height * 0.38 - 18))
        rule.addLine(to: CGPoint(x: page.midX + 30, y: page.height * 0.38 - 18))
        rule.lineWidth = 1.2
        rule.stroke()
    }

    private func recipe(_ r: Recipe, _ ctx: UIGraphicsPDFRendererContext) {
        fill(ctx)
        var top = margin
        let w = page.width - margin * 2
        if let image = images[r.id] {
            let h = (page.height - margin * 2) * 0.34
            let frame = CGRect(x: margin, y: top, width: w, height: h)
            UIBezierPath(roundedRect: frame, cornerRadius: 10).addClip()
            let ratio = max(frame.width / image.size.width, frame.height / image.size.height)
            let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
            image.draw(in: CGRect(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2, width: size.width, height: size.height))
            ctx.cgContext.resetClip()
            top += h + 16 * scale
        }
        let text = content(r)
        let setter = CTFramesetterCreateWithAttributedString(text)
        var start = 0
        var first = true
        while start < text.length {
            if !first { fill(ctx); top = margin }
            first = false
            let frameRect = CGRect(x: margin, y: top, width: w, height: page.height - top - margin)
            let cg = ctx.cgContext
            cg.saveGState()
            cg.textMatrix = .identity
            cg.translateBy(x: 0, y: page.height)
            cg.scaleBy(x: 1, y: -1)
            let flipped = CGRect(x: frameRect.minX, y: page.height - frameRect.maxY, width: frameRect.width, height: frameRect.height)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: start, length: 0), CGPath(rect: flipped, transform: nil), nil)
            CTFrameDraw(frame, cg)
            cg.restoreGState()
            let shown = CTFrameGetVisibleStringRange(frame).length
            if shown <= 0 { break }
            start += shown
        }
    }

    private func content(_ r: Recipe) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let spaced = { (after: CGFloat, indent: CGFloat) -> NSParagraphStyle in
            let p = NSMutableParagraphStyle()
            p.paragraphSpacing = after * scale
            p.headIndent = indent
            p.lineSpacing = 2
            return p
        }
        out.append(NSAttributedString(string: r.title + "\n", attributes: [.font: display(22), .foregroundColor: ink, .paragraphStyle: spaced(4, 0)]))
        let details = [r.category.isEmpty ? nil : r.category, r.minutes.map { RecipeText.formatMinutes($0) }, r.servings.map { "\($0) porții" }].compactMap { $0 }
        if !details.isEmpty {
            out.append(NSAttributedString(string: details.joined(separator: " · ") + "\n", attributes: [.font: body(10), .foregroundColor: soft, .paragraphStyle: spaced(12, 0)]))
        }
        func label(_ text: String) {
            out.append(NSAttributedString(string: text.uppercased(with: Locale(identifier: "ro")) + "\n",
                                          attributes: [.font: body(9, bold: true), .foregroundColor: gold, .kern: 1.4, .paragraphStyle: spaced(6, 0)]))
        }
        if !r.ingredients.isEmpty {
            label("Ingrediente")
            for line in r.ingredients {
                if RecipeText.isHeading(line) {
                    out.append(NSAttributedString(string: line.trimmingCharacters(in: CharacterSet(charactersIn: " :")) + "\n", attributes: [.font: body(10.5, bold: true), .foregroundColor: ink, .paragraphStyle: spaced(3, 0)]))
                } else {
                    out.append(NSAttributedString(string: "•  " + line + "\n", attributes: [.font: body(10.5), .foregroundColor: ink, .paragraphStyle: spaced(3, 12)]))
                }
            }
            out.append(NSAttributedString(string: "\n", attributes: [.font: body(6)]))
        }
        if !r.steps.isEmpty {
            label("Mod de preparare")
            var n = 0
            for step in r.steps {
                if RecipeText.isHeading(step) {
                    out.append(NSAttributedString(string: step.trimmingCharacters(in: CharacterSet(charactersIn: " :")) + "\n", attributes: [.font: body(10.5, bold: true), .foregroundColor: ink, .paragraphStyle: spaced(4, 0)]))
                    continue
                }
                n += 1
                let line = NSMutableAttributedString(string: "\(n).  ", attributes: [.font: body(10.5, bold: true), .foregroundColor: gold])
                line.append(NSAttributedString(string: step + "\n", attributes: [.font: body(10.5), .foregroundColor: ink]))
                line.addAttribute(.paragraphStyle, value: spaced(6, 18), range: NSRange(location: 0, length: line.length))
                out.append(line)
            }
        }
        if let notes = r.notes, !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            out.append(NSAttributedString(string: "\n", attributes: [.font: body(6)]))
            label("Note")
            out.append(NSAttributedString(string: notes + "\n", attributes: [.font: body(10.5), .foregroundColor: soft, .paragraphStyle: spaced(4, 0)]))
        }
        return out
    }
}
