import SwiftUI

/// "Creează o poveste": one question per screen (for whom, about what, how long, its name), then
/// the app writes and reads it; or "Am deja textul" to have a text read.
struct CreateStoryFlow: View {
    enum Step: Int, CaseIterable { case who, topic, length, title }

    let folder: String?
    let onClose: () -> Void
    let onReady: (StoryDraft) -> Void

    @Environment(StoryStore.self) private var store
    @Environment(AuthModel.self) private var auth
    @State private var step: Step = .who
    @State private var brief = CreateStoryFlow.savedBrief()
    @State private var title = ""
    @State private var ownText: String?
    @State private var family = StoryCreator.Family()
    @State private var generating = false
    @State private var error: String?

    static let ages = Array(2...10)
    static let topics = ["animale", "prietenie", "curaj", "pădurea", "marea", "spațiu", "dragoni", "somn"]
    static let lengths: [(id: String, label: String, note: String)] = [
        ("short", "2 min", "Scurtă, pentru când e deja somnoros"),
        ("medium", "4 min", "Cât o poveste obișnuită de culcare"),
        ("long", "7 min", "Pentru o seară fără grabă"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            if generating {
                GeneratingView(title: title)
            } else if ownText != nil {
                ownTextStep
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(question).font(.custom(AppFont.storyDisplay, size: 30, relativeTo: .largeTitle))
                        stepContent
                        if let error {
                            Text(error).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                }
                .scrollDismissesKeyboard(.interactively)
                Button(action: next) { Text(step == .title ? "Creează povestea" : "Mai departe") }
                    .buttonStyle(.ktPrimaryWide)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
        .foregroundStyle(Theme.text)
        .ktNightBackground()
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CloseButton(symbol: step == .who && ownText == nil ? "xmark" : "chevron.left", action: back)
                    .disabled(generating)
            }
            ToolbarItem(placement: .principal) {
                if ownText == nil && !generating { StepDots(count: Step.allCases.count, current: step.rawValue) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if !generating { VoicePill(name: family.narratorName) }
            }
        }
        .task {
            family = await creator?.family() ?? StoryCreator.Family()
            if brief.childName.isEmpty { brief.childName = family.childName }
            if brief.gender == nil { brief.gender = family.childGender }
            if brief.age == nil, let year = family.childBirthYear {
                brief.age = Calendar.current.component(.year, from: Date()) - year
            }
        }
    }

    private var question: String {
        switch step {
        case .who: "Pentru cine e povestea?"
        case .topic: "Despre ce să fie povestea?"
        case .length: "Cât de lungă?"
        case .title: "Cum se numește?"
        }
    }

    @ViewBuilder private var stepContent: some View {
        switch step {
        case .who: whoStep
        case .topic: topicStep
        case .length: lengthStep
        case .title: titleStep
        }
    }

    private var whoStep: some View {
        VStack(alignment: .leading, spacing: 22) {
            NightField(label: "Eroul poveștii", text: $brief.childName, placeholder: "Ana")
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel("Este")
                ChipRow(items: [(id: "girl", label: "fetiță"), (id: "boy", label: "băiețel")], selected: brief.gender) { brief.gender = brief.gender == $0 ? nil : $0 }
            }
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel("Are")
                ChipRow(items: Self.ages.map { (id: "\($0)", label: "\($0) ani") }, selected: brief.age.map { String($0) }) { value in
                    let age = Int(value)
                    brief.age = brief.age == age ? nil : age
                }
            }
        }
    }

    private var topicStep: some View {
        VStack(alignment: .leading, spacing: 22) {
            ChipRow(items: Self.topics.map { (id: $0, label: $0) }, selectedSet: Set(brief.topics)) { topic in
                if let i = brief.topics.firstIndex(of: topic) { brief.topics.remove(at: i) } else { brief.topics.append(topic) }
            }
            NightField(label: "Altceva?", text: $brief.prompt, placeholder: "Ex.: prima zi de grădiniță")
            Button { ownText = "" } label: {
                HStack {
                    Text("Am deja textul poveștii")
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.Night.muted)
                }
                .padding(14)
                .background(Theme.Night.surface, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
    }

    private var lengthStep: some View {
        VStack(spacing: 10) {
            ForEach(Self.lengths, id: \.id) { item in
                Button { brief.length = item.id; Haptics.select() } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.label).font(.ktBodyEmphasis)
                            Text(item.note).font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                        }
                        Spacer()
                        Image(systemName: brief.length == item.id ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(brief.length == item.id ? Theme.accent : Theme.Night.muted)
                    }
                    .padding(16)
                    .background(Theme.Night.surface, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(brief.length == item.id ? Theme.accent : .clear, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var titleStep: some View {
        NightField(label: "Titlul", text: $title, placeholder: brief.topics.first.map { "O poveste despre \($0)" } ?? "Ursulețul curajos")
    }

    private var ownTextStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Am deja textul").font(.custom(AppFont.storyDisplay, size: 30, relativeTo: .largeTitle))
            TextEditor(text: Binding(get: { ownText ?? "" }, set: { ownText = $0 }))
                .scrollContentBackground(.hidden)
                .font(.ktBody)
                .padding(10)
                .frame(minHeight: 220)
                .background(Theme.Night.surface2, in: RoundedRectangle(cornerRadius: 14))
            NightField(label: "Titlul (opțional)", text: $title, placeholder: "Vulpița Fifi")
            if let error {
                Text(error).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
            }
            Spacer(minLength: 0)
            Button { Task { await generate(useOwnText: true) } } label: { Text("Citește textul meu") }
                .buttonStyle(.ktPrimaryWide)
                .disabled((ownText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    // MARK: Steps

    private func back() {
        if ownText != nil { ownText = nil; return }
        if let previous = Step(rawValue: step.rawValue - 1) { withAnimation(.snappy) { step = previous } } else { onClose() }
    }

    private func next() {
        Haptics.tap()
        if let following = Step(rawValue: step.rawValue + 1) {
            withAnimation(.snappy) { step = following }
        } else {
            Task { await generate(useOwnText: false) }
        }
    }

    private var creator: StoryCreator? { store.creator(account: auth.account) }

    private func generate(useOwnText: Bool) async {
        guard let creator else { error = "Contul nu are încă un spațiu. Ieși din cont și intră din nou."; return }
        let about = useOwnText ? nil : (brief.topics.first ?? (brief.prompt.isEmpty ? nil : brief.prompt))
        let name = title.trimmingCharacters(in: .whitespaces).isEmpty
            ? (about.map { "O poveste despre \($0)" } ?? "O poveste nouă") : title.trimmingCharacters(in: .whitespaces)
        title = name
        error = nil
        generating = true
        defer { generating = false }
        if !useOwnText { Self.save(brief) }
        do {
            let result = try await creator.generate(title: name, brief: useOwnText ? nil : brief,
                                                    ownText: useOwnText ? ownText : nil, voice: family.narratorId)
            let draft = StoryDraft(source: .generated, collection: folder)
            draft.title = name
            draft.audioKey = result.audioKey
            draft.text = result.text
            if let first = brief.topics.first { draft.emoji = Self.emoji(for: first) }
            if let url = await store.links?.url(for: result.audioKey, ref: nil) { draft.duration = await audioSeconds(url) }
            Haptics.success()
            onReady(draft)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Nu am putut crea povestea."
        }
    }

    static func emoji(for topic: String) -> String {
        ["animale": "🐻", "prietenie": "🐰", "curaj": "🦁", "pădurea": "🦊", "marea": "🐢", "spațiu": "🚀", "dragoni": "🐉", "somn": "🌙"][topic] ?? "⭐"
    }

    // The brief is remembered on this phone, like the web (kt-story-brief).
    private static let briefKey = "kt-story-brief"
    static func savedBrief() -> StoryCreator.Brief {
        guard let data = UserDefaults.standard.data(forKey: briefKey),
              var brief = try? JSONDecoder().decode(StoryCreator.Brief.self, from: data) else { return .init() }
        brief.topics = []
        brief.prompt = ""
        return brief
    }
    static func save(_ brief: StoryCreator.Brief) {
        if let data = try? JSONEncoder().encode(brief) { UserDefaults.standard.set(data, forKey: briefKey) }
    }
}

/// While the story is being written and read (up to a few minutes).
private struct GeneratingView: View {
    let title: String
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("✨")
                .font(.system(size: 72))
                .scaleEffect(pulse ? 1.08 : 0.94)
                .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)
            Text("Scriem povestea").font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .title))
            Text("„\(title)”").font(.ktCallout).foregroundStyle(Theme.Night.muted)
            Text("Durează cam un minut sau două: o scriem, apoi o citim cu vocea aleasă.")
                .font(.ktFootnote).foregroundStyle(Theme.Night.muted).multilineTextAlignment(.center)
            ProgressView().tint(Theme.Night.moon).padding(.top, 6)
            Spacer()
        }
        .padding(.horizontal, 32)
        .onAppear { pulse = true }
    }
}

/// The narrator voice, as a pill in the corner (set in the web Profile for now).
private struct VoicePill: View {
    let name: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "headphones")
            Text(name.isEmpty ? "Carmen" : String(name.split(separator: " - ").first ?? ""))
        }
            .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(.ultraThinMaterial, in: Capsule())
            .accessibilityLabel("Vocea naratorului: \(name.isEmpty ? "Carmen" : name)")
    }
}

struct StepDots: View {
    let count: Int
    let current: Int
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<count, id: \.self) { i in
                Capsule().fill(i == current ? Theme.accent : Color.white.opacity(0.3))
                    .frame(width: i == current ? 20 : 7, height: 7)
            }
        }
        .animation(.snappy, value: current)
        .accessibilityLabel("Pasul \(current + 1) din \(count)")
    }
}

struct FieldLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "ro")))
            .font(.ktLabel).tracking(1.2)
            .foregroundStyle(Theme.Night.muted)
    }
}

/// A labelled text field on the night background (the keyboard's microphone dictates).
struct NightField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel(label)
            TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Theme.Night.muted))
                .font(.ktBody)
                .padding(.horizontal, 14)
                .frame(height: 50)
                .background(Theme.Night.surface2, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.white.opacity(0.12)))
        }
    }
}

/// Wrapping chips; one selected (`selected`) or several (`selectedSet`).
struct ChipRow: View {
    let items: [(id: String, label: String)]
    var selected: String?
    var selectedSet: Set<String> = []
    let onTap: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.id) { item in
                let on = item.id == selected || selectedSet.contains(item.id)
                Button { onTap(item.id); Haptics.select() } label: {
                    Text(item.label)
                        .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(on ? Theme.onAccent : Theme.text)
                        .padding(.horizontal, 14)
                        .frame(height: 38)
                        .background(Capsule().fill(on ? Theme.accent : Theme.Night.surface2))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// Lays children out in rows, wrapping to the next row when one is full.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
