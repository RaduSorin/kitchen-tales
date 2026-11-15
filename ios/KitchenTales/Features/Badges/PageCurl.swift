import SwiftUI
import UIKit

/// A book turned page by page with the iOS page curl, like Apple Books: the sheet bends under the
/// finger, can be held half way or let go, and shows its back (`back`) and its shadow on the page
/// below. `index` follows the open page and turns the book when changed from outside.
///
/// Double-sided with the spine on the left: UIKit asks for each sheet's front and back in turn
/// (front 0, back 0, front 1, …), and always shows a front with its back.
struct PageCurl<Page: View, Back: View>: UIViewControllerRepresentable {
    let count: Int
    @Binding var index: Int
    @ViewBuilder let page: (Int) -> Page
    @ViewBuilder let back: (Int) -> Back

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIPageViewController {
        let book = UIPageViewController(transitionStyle: .pageCurl, navigationOrientation: .horizontal,
                                        options: [.spineLocation: NSNumber(value: UIPageViewController.SpineLocation.min.rawValue)])
        book.isDoubleSided = true
        book.dataSource = context.coordinator
        book.delegate = context.coordinator
        book.view.backgroundColor = .clear
        let c = context.coordinator
        book.setViewControllers([c.controller(index, back: false), c.controller(index, back: true)], direction: .forward, animated: false)
        return book
    }

    func updateUIViewController(_ book: UIPageViewController, context: Context) {
        let c = context.coordinator
        c.parent = self
        for host in c.hosts.values { host.rootView = c.content(host.index, back: host.isBack) }
        guard let shown = book.viewControllers?.first as? Host, shown.index != index, !c.turning else { return }
        let forward = index > shown.index
        c.turning = true
        book.setViewControllers([c.controller(index, back: false), c.controller(index, back: true)],
                                direction: forward ? .forward : .reverse, animated: true) { _ in
            MainActor.assumeIsolated { c.turning = false }
        }
    }

    final class Host: UIHostingController<AnyView> {
        var index = 0
        var isBack = false
    }

    @MainActor final class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
        var parent: PageCurl
        var hosts: [Int: Host] = [:]
        var turning = false

        init(_ parent: PageCurl) { self.parent = parent }

        func content(_ i: Int, back: Bool) -> AnyView {
            back ? AnyView(parent.back(i)) : AnyView(parent.page(i))
        }

        func controller(_ i: Int, back: Bool) -> Host {
            let key = i * 2 + (back ? 1 : 0)
            if let host = hosts[key] { return host }
            let host = Host(rootView: content(i, back: back))
            host.index = i
            host.isBack = back
            host.view.backgroundColor = .clear
            hosts[key] = host
            return host
        }

        func pageViewController(_ book: UIPageViewController, viewControllerBefore vc: UIViewController) -> UIViewController? {
            guard let host = vc as? Host else { return nil }
            if host.isBack { return controller(host.index, back: false) }
            guard host.index > 0 else { return nil }
            return controller(host.index - 1, back: true)
        }

        func pageViewController(_ book: UIPageViewController, viewControllerAfter vc: UIViewController) -> UIViewController? {
            guard let host = vc as? Host else { return nil }
            if !host.isBack { return controller(host.index, back: true) }
            guard host.index + 1 < parent.count else { return nil }
            return controller(host.index + 1, back: false)
        }

        func pageViewController(_ book: UIPageViewController, willTransitionTo pending: [UIViewController]) {
            // The sheet is caught under the finger.
            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6)
        }

        func pageViewController(_ book: UIPageViewController, didFinishAnimating finished: Bool, previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
            guard completed, let i = (book.viewControllers?.first as? Host)?.index else { return }
            if parent.index != i { parent.index = i }
            // The sheet has settled.
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}
