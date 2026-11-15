import SwiftUI

// "Urmează" (the story queue): the long-press items, the line and the list in the player, the
// child's "Acum sau După?", the card on Acasă and the small number on queued covers.

// MARK: Long-press items

/// "Redă următoarea" and "Adaugă la coadă", at the top of a story's long-press menu.
/// In kid mode only "Adaugă la coadă" (the child's own, up to `UpNext.kidLimit`).
struct QueueMenuItems: View {
    let story: Story
    @Environment(StoryPlayer.self) private var player
    @Environment(KitchenModel.self) private var kitchen
    @Environment(KidMode.self) private var kid

    var body: some View {
        if player.current?.id != story.id {
            if !kid.active {
                Button { tell(player.playNext(story)) } label: {
                    Label("Redă următoarea", systemImage: "text.line.first.and.arrowtriangle.forward")
                }
            }
            Button { tell(player.addToQueue(story, byKid: kid.active)) } label: {
                Label("Adaugă la coadă", systemImage: "text.line.last.and.arrowtriangle.forward")
            }
        }
    }

    private func tell(_ result: StoryPlayer.QueueResult) {
        kitchen.say(StoryPlayer.message(result, playing: player.current != nil))
    }
}

/// A small gold number on a cover that waits in "Urmează" (its place in the list).
struct QueuePlaceBadge: View {
    let id: String
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        if let place = player.upNext.place(of: id) {
            Text(place, format: .number)
                .font(.custom(AppFont.bodyHeavy, size: 11, relativeTo: .caption2))
                .foregroundStyle(Theme.Night.ink)
                .frame(minWidth: 18, minHeight: 18)
                .padding(.horizontal, 2)
                .background(Capsule().fill(Theme.Night.moon))
                .accessibilityLabel("În coadă, a \(place)-a")
        }
    }
}

// MARK: In the player

/// The line under the player's buttons: what plays next. Tap it for the whole list.
struct UpNextLine: View {
    @Environment(StoryPlayer.self) private var player
    @State private var open = false

    var body: some View {
        Button { Haptics.tap(); open = true } label: {
            HStack(spacing: 10) {
                if let next = player.following {
                    StoryCover(story: next, cornerRadius: 6).frame(width: 34, height: 34)
                } else {
                    Image(systemName: "moon.fill")
                        .foregroundStyle(Theme.Night.moon)
                        .frame(width: 34, height: 34)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(Self.caption(player))
                        .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                        .tracking(0.6)
                        .foregroundStyle(Theme.text.opacity(0.6))
                    Text(player.following?.title ?? "Nimic după povestea asta")
                        .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if !player.upNext.isEmpty {
                    Label("\(player.upNext.count)", systemImage: "list.bullet")
                        .font(.custom(AppFont.bodyHeavy, size: 12, relativeTo: .caption))
                        .foregroundStyle(Theme.Night.moon)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Theme.Night.moon.opacity(0.16)))
                }
                Image(systemName: "chevron.up").font(.footnote.bold()).opacity(0.5)
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.09)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.spoken(player))
        .accessibilityHint("Deschide lista Urmează")
        .sheet(isPresented: $open) { UpNextSheet() }
    }

    static func caption(_ player: StoryPlayer) -> String {
        guard let next = player.following else { return "URMEAZĂ" }
        if player.queuedNext?.id == next.id {
            let byKid = player.upNext.items.first { $0.id == next.id }?.byKid ?? false
            return byKid ? "URMEAZĂ · ALES DE COPIL" : "URMEAZĂ · ALES DE TINE"
        }
        return "URMEAZĂ · DIN FOLDER"
    }

    static func spoken(_ player: StoryPlayer) -> String {
        guard let next = player.following else { return "Nu urmează nicio poveste" }
        return "Urmează: \(next.title)"
    }
}

/// "Urmează": the story playing, the ones the family chose (drag to move, swipe to take out) and
/// then what the folder plays by itself. A moon marks the story after which the player stops.
struct UpNextSheet: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                nowSection
                chosenSection
                folderSection
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Night.top)
            .navigationTitle("Urmează")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Gata") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Theme.Night.top)
        .environment(\.colorScheme, .dark)
        .onAppear {
            if store.phase == .loaded { player.forgetMissing(Set(store.allStories.map(\.id))) }
        }
    }

    /// The stories still to come, in order: the chosen ones, then the folder's.
    private var upcoming: [Story] { player.queuedStories.map(\.story) + player.folderAfter(limit: 5) }

    /// The story after which the player stops by itself ("După N povești"), nil when it is the one
    /// playing now or not in the list.
    private var stopsAfter: String? {
        let n = UpNext.untilStop(stopAfter: player.stopAfter, played: player.playedInRun)
        let list = upcoming
        guard n > 0, n <= list.count else { return nil }
        return list[n - 1].id
    }

    private var stopsNow: Bool {
        UpNext.untilStop(stopAfter: player.stopAfter, played: player.playedInRun) == 0
    }

    @ViewBuilder private var nowSection: some View {
        if let current = player.current {
            Section {
                QueueRow(story: current, note: "acum", moon: stopsNow, dim: false)
                    .listRowBackground(Color.white.opacity(0.08))
            } footer: {
                if stopsNow { Text(Self.stopNote(player.stopAfter)) }
            }
        }
    }

    @ViewBuilder private var chosenSection: some View {
        let chosen = player.queuedStories
        let stop = stopsAfter
        Section {
            if chosen.isEmpty {
                Text("Ține apăsat pe o poveste și alege „Adaugă la coadă”.")
                    .font(.ktFootnote)
                    .foregroundStyle(Theme.Night.muted)
                    .listRowBackground(Color.white.opacity(0.05))
            }
            ForEach(chosen) { item in
                Button { Task { await player.playFromQueue(item.story) } } label: {
                    QueueRow(story: item.story, note: item.byKid ? "ales de copil" : nil, moon: stop == item.story.id, dim: false, handle: !kid.active)
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.white.opacity(0.05))
                .deleteDisabled(kid.active && !item.byKid)
                .moveDisabled(kid.active)
            }
            .onDelete { offsets in
                for i in offsets where i < chosen.count { player.removeFromQueue(chosen[i].story.id) }
            }
            .onMove { offsets, destination in player.moveInQueue(from: offsets, to: destination) }
        } header: {
            HStack {
                Text(kid.active ? "Alese" : "Alese de tine")
                Spacer()
                if !chosen.isEmpty && !kid.active {
                    Button("Golește") { Haptics.tap(); player.clearQueue() }
                        .font(.footnote.bold())
                        .foregroundStyle(Theme.Night.moon)
                        .textCase(nil)
                }
            }
        } footer: {
            if kid.active { Text(Self.kidNote(player.upNext.kidCount)) }
        }
    }

    @ViewBuilder private var folderSection: some View {
        let rest = player.folderAfter(limit: 5)
        let stop = stopsAfter
        if !rest.isEmpty {
            Section {
                ForEach(rest) { story in
                    QueueRow(story: story, note: nil, moon: stop == story.id, dim: true)
                        .listRowBackground(Color.white.opacity(0.03))
                }
            } header: {
                Text(Self.folderTitle(player))
            }
        }
    }

    static func folderTitle(_ player: StoryPlayer) -> String {
        let name = player.queue.first.map(StoryLibrary.folderOf) ?? ""
        let base = name.isEmpty ? "Apoi, de la sine" : "Apoi din \(name)"
        return player.shuffle ? base + " · amestecat" : base
    }

    static func stopNote(_ n: Int) -> String {
        n == 1 ? "Se oprește după povestea asta (După 1 poveste)." : "Se oprește după povestea asta (După \(n) povești)."
    }

    static func kidNote(_ chosen: Int) -> String {
        let left = max(0, UpNext.kidLimit - chosen)
        if left == 0 { return "Ai ales toate poveștile pentru acum." }
        return left == 1 ? "Mai poți alege o poveste." : "Mai poți alege \(left) povești."
    }
}

/// One story in "Urmează": cover, title, length or a note, the moon where the player stops.
private struct QueueRow: View {
    let story: Story
    let note: String?
    let moon: Bool
    let dim: Bool
    var handle = false

    var body: some View {
        HStack(spacing: 12) {
            StoryCover(story: story, cornerRadius: 6).frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(story.title).font(.ktBodyEmphasis).foregroundStyle(Theme.text).lineLimit(1)
                Text(Self.detail(story, note: note))
                    .font(.ktFootnote).foregroundStyle(Theme.Night.muted).lineLimit(1)
            }
            Spacer(minLength: 4)
            if moon {
                Image(systemName: "moon.fill")
                    .foregroundStyle(Theme.Night.moon)
                    .accessibilityLabel("Aici se oprește")
            }
            if handle {
                Image(systemName: "line.3.horizontal").foregroundStyle(Theme.Night.muted)
                    .accessibilityHidden(true)
            }
        }
        .opacity(dim ? 0.55 : 1)
        .contentShape(Rectangle())
    }

    static func detail(_ story: Story, note: String?) -> String {
        [note, story.minutesLabel].compactMap { $0 }.joined(separator: " · ")
    }
}

// MARK: Kid mode: "Acum sau După?"

extension View {
    /// In kid mode, a story tapped while another one plays asks "Acum sau După?".
    func kidQueueChoice() -> some View { modifier(KidQueueChoice()) }
}

private struct KidQueueChoice: ViewModifier {
    @Environment(StoryPlayer.self) private var player
    @Environment(KitchenModel.self) private var kitchen

    func body(content: Content) -> some View {
        content.overlay {
            if let choice = player.pendingChoice {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                        .onTapGesture { player.pendingChoice = nil }
                    KidChoiceCard(story: choice.story, full: !player.upNext.kidHasRoom) { now in
                        Task {
                            let result = await player.answer(choice, now: now)
                            if let result { kitchen.say(StoryPlayer.message(result, playing: true)) }
                        }
                    }
                    .padding(.horizontal, 28)
                }
                .transition(.opacity)
            }
        }
        .animation(.snappy, value: player.pendingChoice?.id)
    }
}

private struct KidChoiceCard: View {
    let story: Story
    let full: Bool
    let choose: (Bool) -> Void

    var body: some View {
        VStack(spacing: 14) {
            StoryCover(story: story, cornerRadius: 18).frame(width: 140, height: 140)
            Text(story.title)
                .font(.custom(AppFont.kidsHeavy, size: 22, relativeTo: .title2))
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text("Când o asculți?")
                .font(.custom(AppFont.kidsSemibold, size: 18, relativeTo: .headline))
                .foregroundStyle(Theme.Night.muted)
            HStack(spacing: 12) {
                big("play.fill", "Acum", fill: .white) { choose(true) }
                big("moon.fill", "După", fill: Theme.Night.moon) { choose(false) }
                    .disabled(full)
                    .opacity(full ? 0.4 : 1)
            }
        }
        .foregroundStyle(Theme.text)
        .padding(20)
        .frame(maxWidth: 360)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Color(hex: 0x231F2A)))
        .environment(\.colorScheme, .dark)
    }

    private func big(_ symbol: String, _ title: String, fill: Color, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); action() } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 30, weight: .bold))
                Text(title).font(.custom(AppFont.kidsHeavy, size: 20, relativeTo: .title3))
            }
            .foregroundStyle(Theme.Night.ink)
            .frame(maxWidth: .infinity, minHeight: 96)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(fill))
        }
        .buttonStyle(PressableStyle())
    }
}

// MARK: Acasă

/// On Acasă while nothing plays: the stories waiting in "Urmează", ready to start at bedtime.
struct QueueTonightCard: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @State private var open = false

    var body: some View {
        let list = player.queuedStories.map(\.story)
        if player.current == nil, let first = list.first {
            HStack(spacing: 12) {
                Button { open = true } label: {
                    HStack(spacing: 12) {
                        StoryCover(story: first, cornerRadius: 8).frame(width: 52, height: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.heading(list))
                                .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                                .tracking(0.8)
                                .foregroundStyle(Theme.Night.moon)
                            Text(Self.titles(list))
                                .font(.ktBodyEmphasis)
                                .foregroundStyle(Theme.text)
                                .lineLimit(2)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button { Haptics.tap(); Task { await player.playQueue(store: store) } } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Theme.Night.ink)
                        .frame(width: 46, height: 46)
                        .background(Circle().fill(.white))
                }
                .accessibilityLabel("Pornește coada")
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.Night.moon.opacity(0.14)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.Night.moon.opacity(0.3)))
            .sheet(isPresented: $open) { UpNextSheet() }
        }
    }

    static func heading(_ list: [Story]) -> String {
        let minutes = Int((list.compactMap(\.durationSec).reduce(0, +) / 60).rounded())
        let count = list.count == 1 ? "1 POVESTE" : "\(list.count) POVEȘTI"
        return minutes > 0 ? "COADA TA · \(count) · \(minutes) MIN" : "COADA TA · \(count)"
    }

    static func titles(_ list: [Story]) -> String {
        list.prefix(3).map(\.title).joined(separator: ", ") + (list.count > 3 ? "…" : "")
    }
}
