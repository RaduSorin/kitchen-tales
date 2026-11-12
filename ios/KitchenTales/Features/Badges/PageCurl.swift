import SwiftUI
import UIKit

/// A book turned page by page with the iOS page curl (the web's Flipbook): swipe or tap the
/// edge of a page. `index` follows the open page and turns the book when changed from outside.
struct PageCurl<Page: View>: UIViewControllerRepresentable {
    let count: Int
    @Binding var index: Int
    @ViewBuilder let page: (Int) -> Page

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIPageViewController {
        let book = UIPageViewController(transitionStyle: .pageCurl, navigationOrientation: .horizontal,
                                        options: [.spineLocation: NSNumber(value: UIPageViewController.SpineLocation.min.rawValue)])
        book.isDoubleSided = false
        book.dataSource = context.coordinator
        book.delegate = context.coordinator
        book.view.backgroundColor = .clear
        book.setViewControllers([context.coordinator.controller(index)], direction: .forward, animated: false)
        return book
    }

    func updateUIViewController(_ book: UIPageViewController, context: Context) {
        let c = context.coordinator
        c.parent = self
        for (i, host) in c.hosts { host.rootView = AnyView(page(i)) }
        guard let shown = book.viewControllers?.first as? Host, shown.index != index, !c.turning else { return }
        let forward = index > shown.index
        c.turning = true
        book.setViewControllers([c.controller(index)], direction: forward ? .forward : .reverse, animated: true) { _ in
            MainActor.assumeIsolated { c.turning = false }
        }
    }

    final class Host: UIHostingController<AnyView> {
        var index = 0
    }

    @MainActor final class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
        var parent: PageCurl
        var hosts: [Int: Host] = [:]
        var turning = false

        init(_ parent: PageCurl) { self.parent = parent }

        func controller(_ i: Int) -> Host {
            if let host = hosts[i] { return host }
            let host = Host(rootView: AnyView(parent.page(i)))
            host.index = i
            host.view.backgroundColor = .clear
            hosts[i] = host
            return host
        }

        func pageViewController(_ book: UIPageViewController, viewControllerBefore vc: UIViewController) -> UIViewController? {
            guard let i = (vc as? Host)?.index, i > 0 else { return nil }
            return controller(i - 1)
        }

        func pageViewController(_ book: UIPageViewController, viewControllerAfter vc: UIViewController) -> UIViewController? {
            guard let i = (vc as? Host)?.index, i + 1 < parent.count else { return nil }
            return controller(i + 1)
        }

        func pageViewController(_ book: UIPageViewController, didFinishAnimating finished: Bool, previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
            guard completed, let i = (book.viewControllers?.first as? Host)?.index else { return }
            if parent.index != i { parent.index = i }
            UISelectionFeedbackGenerator().selectionChanged()
        }
    }
}
