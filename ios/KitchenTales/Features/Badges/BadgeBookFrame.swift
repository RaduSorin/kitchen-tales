import SwiftUI

/// The full-screen view of a medal book (design-polish/ios-medals/pagini-concept.jpg): nothing
/// around the book but a glow in its colour, the close chevron, the name and the count on top,
/// and a row of page dots with "Pagina X din N · capitol" below. Drag the dots to leaf through,
/// pull the top down (or tap the chevron) to close. No tab bar and no hint text.
struct BadgeBookFrame<Book: View>: View {
    let title: String
    let count: String
    let glow: Color
    let pages: Int
    @Binding var page: Int
    let caption: (Int) -> String
    /// The book, given the width its page should have.
    @ViewBuilder let book: (CGFloat) -> Book

    @Environment(\.dismiss) private var dismiss
    @State private var pull: CGFloat = 0

    var body: some View {
        VStack(spacing: 10) {
            header
            GeometryReader { geo in
                let w = Self.pageWidth(geo.size)
                book(w)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            BookDots(pages: pages, page: $page, tint: glow)
            Text(caption(page))
                .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
                .foregroundStyle(.white.opacity(0.62))
                .contentTransition(.numericText())
                .animation(.snappy, value: page)
                .padding(.bottom, 10)
        }
        .offset(y: pull)
        .scaleEffect(1 - min(pull, 400) / 2400)
        .background { backdrop }
        .toolbar(.hidden, for: .navigationBar)
        .statusBarHidden(false)
    }

    /// As wide as fits with room for the tabs and the wire, at the page's 282×470 shape.
    static func pageWidth(_ size: CGSize) -> CGFloat {
        max(120, min(size.width - 64, size.height * 282 / 470, 420))
    }

    private var backdrop: some View {
        ZStack {
            Color(hex: 0x08070B)
            RadialGradient(colors: [glow.opacity(0.5), glow.opacity(0.12), .clear], center: UnitPoint(x: 0.5, y: 0.45), startRadius: 10, endRadius: 460)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.white.opacity(0.08)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Închide")
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text(title)
                    .font(.custom(AppFont.storyDisplay, size: 20, relativeTo: .title3))
                    .foregroundStyle(Color(hex: 0xFFF6E4))
                Text(count)
                    .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                    .foregroundStyle(.white.opacity(0.6))
                    .monospacedDigit()
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 12)
                .onChanged { v in pull = max(0, v.translation.height) }
                .onEnded { v in
                    if v.translation.height > 110 || v.predictedEndTranslation.height > 260 { dismiss() }
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { pull = 0 }
                }
        )
    }
}

/// A row of dots, one a page: the open one long and lit. Drag along it to leaf through fast.
struct BookDots: View {
    let pages: Int
    @Binding var page: Int
    let tint: Color

    var body: some View {
        GeometryReader { geo in
            let step = Self.step(width: geo.size.width, pages: pages)
            HStack(spacing: step - 6) {
                ForEach(0..<pages, id: \.self) { i in
                    Capsule()
                        .fill(i == page ? Color(hex: 0xF2C879) : .white.opacity(0.25))
                        .frame(width: i == page ? 16 : 6, height: 6)
                }
            }
            .animation(.snappy, value: page)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        let total = CGFloat(pages - 1) * step + 16
                        let left = (geo.size.width - total) / 2
                        let i = min(pages - 1, max(0, Int(((v.location.x - left) / step).rounded(.down))))
                        if i != page {
                            page = i
                            Haptics.select()
                        }
                    }
            )
        }
        .frame(height: 30)
        .padding(.horizontal, 24)
        .accessibilityElement()
        .accessibilityLabel("Pagina \(page + 1) din \(pages)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: page = min(pages - 1, page + 1)
            case .decrement: page = max(0, page - 1)
            @unknown default: break
            }
        }
    }

    private static func step(width: CGFloat, pages: Int) -> CGFloat {
        min(14, max(8, (width - 40) / CGFloat(max(pages, 1))))
    }
}
