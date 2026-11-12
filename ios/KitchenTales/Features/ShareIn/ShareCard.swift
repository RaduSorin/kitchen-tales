import LinkPresentation
import Observation
import SwiftUI
import UIKit

/// The small card the Share extension shows over TikTok, Instagram or Safari (concept
/// design-polish/ios-native, part A): it imports, then offers Săptămâna or the recipe page; when
/// there is no recipe, it offers to keep the link in "De încercat".
@MainActor @Observable
final class ShareCardModel {
    enum Phase: Equatable {
        case working(step: Int)
        case saved(SharedRecipe)
        case planned(SharedRecipe, day: String)
        case notRecipe
        case kept(SharedRecipe)
        case failed(String)
        case signedOut
    }

    let input: ShareInput
    private(set) var phase: Phase = .working(step: 0)
    /// The page's title and picture (LinkPresentation), or the shared photo.
    private(set) var previewTitle: String?
    private(set) var thumbnail: UIImage?
    private(set) var busy = false
    /// "Pune în Săptămâna" shows the next days to pick from.
    var picksDay = false

    @ObservationIgnored private var kitchen: ShareKitchen?
    @ObservationIgnored private var jobId: String?
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private let demo: Bool

    init(input: ShareInput) {
        self.input = input
        demo = false
        if case .image(let data) = input { thumbnail = UIImage(data: data) }
    }

    /// Screenshots: a card in a given state, with no server.
    init(demo phase: Phase, input: ShareInput, title: String?, thumbnail: UIImage?) {
        self.input = input
        demo = true
        self.phase = phase
        previewTitle = title
        self.thumbnail = thumbnail
    }

    var sourceURL: URL? { if case .link(let url) = input { return url } else { return nil } }

    func start() {
        guard !demo, task == nil else { return }
        task = Task { await run() }
    }

    private func run() async {
        guard let kitchen = ShareKitchen.open() else { phase = .signedOut; return }
        self.kitchen = kitchen
        if let url = sourceURL { Task { await loadPreview(url) } }
        do {
            phase = .working(step: 0)
            let jobId = try await kitchen.startImport(input)
            self.jobId = jobId
            phase = .working(step: 1)
            let steps = Task { [weak self] in
                try? await Task.sleep(for: .seconds(9))
                if case .working(_)? = self?.phase { self?.phase = .working(step: 2) }
            }
            defer { steps.cancel() }
            let data = try await AIJob.wait(kitchen.client, space: kitchen.space, jobId: jobId)
            guard let json = data as? [String: Any] else { phase = .notRecipe; return }
            let recipe = try await kitchen.saveImported(json, sourceUrl: sourceURL?.absoluteString)
            if thumbnail == nil, let key = recipe.photoKey { await loadPhoto(key) }
            phase = .saved(recipe)
        } catch is CancellationError {
            return
        } catch BackendError.server(let message) where ShareKitchen.isNoRecipe(message) {
            phase = .notRecipe
        } catch {
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Nu a mers. Încearcă din nou.")
        }
    }

    /// "Gata, lucrează în fundal": the app saves it the next time it opens.
    func leaveRunning() {
        guard let jobId else { return }
        task?.cancel()
        PendingImports().add(.init(jobId: jobId, sourceUrl: sourceURL?.absoluteString, startedAt: Date()))
    }

    func cancel() { task?.cancel() }

    func keepLink() async {
        guard let url = sourceURL, let kitchen else { return }
        busy = true
        defer { busy = false }
        do { phase = .kept(try await kitchen.keepLink(url, title: previewTitle)) } catch { phase = .failed("Linkul nu s-a salvat. Încearcă din nou.") }
    }

    func choose(category: String) async {
        guard case .saved(var recipe) = phase, recipe.category != category else { return }
        recipe.category = category
        phase = .saved(recipe)
        try? await kitchen?.setCategory(recipe.id, category)
    }

    func plan(on day: Date) async {
        guard case .saved(let recipe) = phase, let kitchen else { return }
        busy = true
        defer { busy = false }
        do {
            try await kitchen.plan(recipe.id, on: day)
            phase = .planned(recipe, day: Self.dayName(day))
        } catch {
            phase = .failed("Nu am putut pune rețeta în Săptămâna.")
        }
    }

    /// The next seven days for "Pune în Săptămâna": Azi, Mâine, then the weekday.
    nonisolated static func nextDays(from start: Date = Date(), calendar: Calendar = .current) -> [Date] {
        (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: calendar.startOfDay(for: start)) }
    }

    nonisolated static func dayName(_ day: Date, today: Date = Date(), calendar: Calendar = .current) -> String {
        let diff = calendar.dateComponents([.day], from: calendar.startOfDay(for: today), to: calendar.startOfDay(for: day)).day ?? 0
        if diff == 0 { return "azi" }
        if diff == 1 { return "mâine" }
        let names = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"]
        return names[(calendar.component(.weekday, from: day) - 1 + 7) % 7]
    }

    private func loadPreview(_ url: URL) async {
        let provider = LPMetadataProvider()
        provider.timeout = 8
        guard let metadata = try? await provider.startFetchingMetadata(for: url) else { return }
        previewTitle = metadata.title
        if thumbnail == nil, let images = metadata.imageProvider {
            let image: UIImage? = await withCheckedContinuation { done in
                images.loadObject(ofClass: UIImage.self) { object, _ in done.resume(returning: object as? UIImage) }
            }
            if let image { thumbnail = image }
        }
    }

    private func loadPhoto(_ key: String) async {
        guard let kitchen, let url = await FileLinks(client: kitchen.client).url(for: key, ref: nil),
              let (data, _) = try? await URLSession.shared.data(from: url) else { return }
        thumbnail = UIImage(data: data)
    }
}

/// The card itself, at the bottom over a dimmed host app.
struct ShareCardView: View {
    @Bindable var model: ShareCardModel
    let onClose: () -> Void
    let onOpenRecipe: (String) -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.45).ignoresSafeArea().onTapGesture { if isDone { onClose() } }
            VStack(alignment: .leading, spacing: 0) { content }
                .padding(20)
                .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(Color(hex: 0x1C1B21)))
                .shadow(color: .black.opacity(0.5), radius: 30, y: -10)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
        }
        .environment(\.colorScheme, .dark)
        .onAppear { model.start() }
    }

    private var isDone: Bool {
        switch model.phase {
        case .working: return false
        default: return true
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .working(let step):
            header("Salvez rețeta", action: "Anulează") { model.cancel(); onClose() }
            preview(title: model.previewTitle ?? "Citesc ce ai trimis…", detail: model.input.origin)
            ProgressView(value: Double(step + 1), total: 4).tint(Theme.accent).padding(.top, 18)
            VStack(alignment: .leading, spacing: 4) {
                stepLine(model.sourceURL == nil ? "Am citit ce ai trimis" : "Am citit linkul și descrierea", done: step >= 1, current: step == 0)
                stepLine("Caut ingredientele", done: step >= 2, current: step == 1)
                stepLine("Scriu pașii…", done: false, current: step == 2)
            }
            .padding(.top, 10)
            secondary("Gata, lucrează în fundal") { model.leaveRunning(); onClose() }
                .disabled(step == 0)
        case .saved(let recipe):
            header("✓ Salvată în Bucătăria", action: "Închide", run: onClose)
            preview(title: recipe.title, detail: Self.facts(recipe))
            categories(recipe)
            if model.picksDay { days } else {
                primary("Pune în Săptămâna") { withAnimation(.snappy) { model.picksDay = true } }
            }
            secondary("Deschide rețeta") { onOpenRecipe(recipe.id) }
        case .planned(let recipe, let day):
            header("✓ Pusă în Săptămâna", action: "Închide", run: onClose)
            preview(title: recipe.title, detail: "O gătiți \(day)")
            secondary("Deschide rețeta") { onOpenRecipe(recipe.id) }
        case .notRecipe:
            header("Nu am găsit o rețetă", action: "Închide", run: onClose)
            Text("În descrierea și subtitrările de aici nu apar ingrediente sau pași, așa că nu am salvat nimic. Încercarea nu se numără la limita lunară.")
                .font(.ktCallout).foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            if model.sourceURL != nil {
                primary("Păstrează linkul în „De încercat”") { Task { await model.keepLink() } }
            }
        case .kept(let recipe):
            header("✓ Păstrat în „De încercat”", action: "Închide", run: onClose)
            preview(title: recipe.title, detail: "Îl găsești în Rețete, la „De încercat”.")
        case .failed(let message):
            header("Nu a mers", action: "Închide", run: onClose)
            Text(message).font(.ktCallout).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
        case .signedOut:
            header("Conectează-te întâi", action: "Închide", run: onClose)
            Text("Deschide Bucătăria și conectează-te, apoi trimite din nou.")
                .font(.ktCallout).foregroundStyle(Theme.muted)
        }
    }

    nonisolated static func facts(_ r: SharedRecipe) -> String {
        var parts: [String] = []
        if let m = r.minutes, m > 0 { parts.append("\(m) min") }
        if let s = r.servings, s > 0 { parts.append(s == 1 ? "1 porție" : "\(s) porții") }
        if r.ingredientCount > 0 { parts.append(r.ingredientCount == 1 ? "1 ingredient" : "\(r.ingredientCount) ingrediente") }
        return parts.joined(separator: " · ")
    }

    private func header(_ title: String, action: String, run: @escaping () -> Void) -> some View {
        HStack {
            Text(title).font(.custom(AppFont.bodyBold, size: 16, relativeTo: .headline)).foregroundStyle(Theme.text)
            Spacer()
            Button(action, action: run).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .body)).foregroundStyle(Theme.accent)
        }
        .padding(.bottom, 14)
    }

    private func preview(title: String, detail: String) -> some View {
        HStack(spacing: 12) {
            Group {
                if let image = model.thumbnail {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    ZStack { Theme.surface2; Text("🍲").font(.system(size: 30)) }
                }
            }
            .frame(width: 76, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.custom(AppFont.storyDisplay, size: 21, relativeTo: .title3)).foregroundStyle(Theme.text).lineLimit(2)
                if !detail.isEmpty { Text(detail).font(.footnote).foregroundStyle(Theme.muted).lineLimit(2) }
            }
            Spacer(minLength: 0)
        }
    }

    private func stepLine(_ text: String, done: Bool, current: Bool) -> some View {
        Text(done ? "✓ \(text)" : text)
            .font(current ? .footnote.weight(.semibold) : .footnote)
            .foregroundStyle(current ? Theme.text : Theme.muted.opacity(done ? 1 : 0.6))
    }

    private func categories(_ recipe: SharedRecipe) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Self.categoryOrder(recipe.category), id: \.self) { name in
                    let on = name == recipe.category
                    Button { Task { await model.choose(category: name) } } label: {
                        Text(name).font(.footnote.weight(on ? .semibold : .regular))
                            .foregroundStyle(on ? Theme.accent : Theme.text)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(on ? Theme.accentSoft : Color.white.opacity(0.11)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 14)
    }

    /// The AI's category first, then the rest.
    nonisolated static func categoryOrder(_ chosen: String?) -> [String] {
        guard let chosen, !chosen.isEmpty else { return ShareCategories.all }
        return [chosen] + ShareCategories.all.filter { $0 != chosen }
    }

    private var days: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ShareCardModel.nextDays(), id: \.self) { day in
                    Button { Task { await model.plan(on: day) } } label: {
                        Text(ShareCardModel.dayName(day).capitalized(with: Locale(identifier: "ro")))
                            .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .body))
                            .foregroundStyle(Theme.onAccent)
                            .padding(.horizontal, 16).frame(height: 44)
                            .background(Capsule().fill(Theme.accent))
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy)
                }
            }
        }
        .padding(.top, 16)
    }

    private func primary(_ title: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title).font(.custom(AppFont.bodyBold, size: 16, relativeTo: .body)).foregroundStyle(Theme.onAccent)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(Capsule().fill(Theme.accent))
                .overlay { if model.busy { ProgressView().tint(Theme.onAccent) } }
        }
        .buttonStyle(.plain)
        .disabled(model.busy)
        .padding(.top, 16)
    }

    private func secondary(_ title: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title).font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .body)).foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity).frame(height: 46)
                .background(Capsule().fill(Color.white.opacity(0.11)))
        }
        .buttonStyle(.plain)
        .padding(.top, 10)
    }
}
