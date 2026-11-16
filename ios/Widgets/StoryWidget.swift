import AppIntents
import SwiftUI
import WidgetKit

/// "Povestea de diseară": the story "Ora de culcare" would start tonight, with "Ascultă".
struct TonightStoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKinds.story, provider: KitchenProvider()) { entry in
            TonightStoryView(entry: entry)
        }
        .configurationDisplayName("Povestea de diseară")
        .description("Povestea de la ora de culcare. „Ascultă” o pornește direct.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
        .contentMarginsDisabled()
    }
}

struct TonightStoryView: View {
    let entry: KitchenEntry
    @Environment(\.widgetFamily) private var family

    private var s: WidgetSnapshot { entry.snapshot }
    private var first: WidgetSnapshot.StoryItem? { s.tonight.first }

    var body: some View {
        content
            .widgetURL(WLinks.story(first?.id ?? ""))
            .containerBackground(for: .widget) {
                if family == .systemSmall || family == .systemMedium { WGlow() } else { AccessoryWidgetBackground() }
            }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryRectangular: TonightRectangular(story: first, bedtime: WidgetRules.bedtimeToday(s, now: entry.date))
        case .accessoryCircular: TonightCircular(bedtime: WidgetRules.bedtimeToday(s, now: entry.date))
        case .accessoryInline: Text(Self.inline(s, now: entry.date))
        default:
            if !s.signedIn {
                WOpenApp(text: "Deschide aplicația ca să apară povestea de diseară.")
            } else if let first {
                if family == .systemMedium {
                    TonightMedium(story: first, next: s.tonight.dropFirst().first?.title,
                                  kicker: WidgetRules.tonightKicker(s, now: entry.date))
                } else {
                    TonightSmall(story: first)
                }
            } else {
                WOpenApp(text: "Nicio poveste încă. Adaugă una din aplicație.")
            }
        }
    }

    /// "Culcarea la 20:30", or "Diseară: Regele Leu".
    static func inline(_ s: WidgetSnapshot, now: Date) -> String {
        if let time = WidgetRules.bedtimeToday(s, now: now) { return "Culcarea la \(time)" }
        return s.tonight.first.map { "Diseară: \($0.title)" } ?? "Povești"
    }
}

/// Small: the whole cover, the title on it, the gold play button (or a progress line when the
/// story was left half-way: "Continuă").
private struct TonightSmall: View {
    let story: WidgetSnapshot.StoryItem

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            WPhoto(name: story.image)
            WScrim()
            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    WKicker(text: story.progress == nil ? "Diseară" : "Continuă")
                    Text(story.title)
                        .font(WFont.serif(17))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                    if let progress = story.progress { WBar(value: progress).padding(.top, 4) }
                }
                if story.progress == nil, !story.id.isEmpty {
                    Spacer(minLength: 0)
                    Button(intent: PlayTonightIntent(storyId: story.id)) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Theme.onAccent)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(Theme.accent))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Ascultă \(story.title)")
                }
            }
            .padding(13)
        }
    }
}

/// Medium: the cover on the left, "Diseară · 20:30", the title, "Ascultă" and what comes next.
private struct TonightMedium: View {
    let story: WidgetSnapshot.StoryItem
    let next: String?
    let kicker: String

    var body: some View {
        HStack(spacing: 0) {
            WPhoto(name: story.image)
                .frame(width: 118)
                .overlay(alignment: .trailing) {
                    LinearGradient(colors: [.clear, Theme.background], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 24)
                }
            VStack(alignment: .leading, spacing: 0) {
                WKicker(text: story.progress == nil ? kicker : "Continuă")
                Text(story.title)
                    .font(WFont.serif(22))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 6)
                Text(story.detail)
                    .font(WFont.text(12.5))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .padding(.top, 3)
                Spacer(minLength: 6)
                HStack(spacing: 10) {
                    if !story.id.isEmpty {
                        Button(intent: PlayTonightIntent(storyId: story.id)) {
                            WGoldPill(title: story.progress == nil ? "Ascultă" : "Continuă", play: true)
                        }
                        .buttonStyle(.plain)
                    }
                    if let next {
                        Text("apoi \(next)")
                            .font(WFont.text(12.5))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 14)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Lock Screen: "Diseară / Regele Leu / 20:30 · 9 min".
private struct TonightRectangular: View {
    let story: WidgetSnapshot.StoryItem?
    let bedtime: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Diseară").font(.headline)
            Text(story?.title ?? "Nicio poveste").lineLimit(1)
            Text(Self.line(story, bedtime: bedtime)).foregroundStyle(.secondary).lineLimit(1)
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .widgetAccentable()
    }

    static func line(_ story: WidgetSnapshot.StoryItem?, bedtime: String?) -> String {
        [bedtime, story?.minutes].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Lock Screen, round: the moon and the bedtime.
private struct TonightCircular: View {
    let bedtime: String?

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: "moon.fill").font(.system(size: 18, weight: .semibold))
            Text(bedtime ?? "Povești")
                .font(.system(size: 11, weight: .semibold))
                .minimumScaleFactor(0.7)
        }
        .widgetAccentable()
    }
}
