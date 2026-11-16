import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// The cooking timers on the Lock Screen and in the Dynamic Island (concept part 1).
struct CookTimerActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CookTimerAttributes.self) { context in
            CookLockView(attributes: context.attributes, clocks: context.state.clocks, isStale: context.isStale)
                .activityBackgroundTint(Theme.background.opacity(0.9))
                .activitySystemActionForegroundColor(Theme.accent)
                .widgetURL(WLinks.cook(context.state.clocks.first?.step ?? 0))
        } dynamicIsland: { context in
            CookIsland.make(attributes: context.attributes, clocks: context.state.clocks, isStale: context.isStale)
        }
    }
}

/// How one timer looks right now.
enum CookFace {
    /// Rang: done in the app, or (while the app is away) past its end, which the system marks by
    /// making the content stale at the first end time.
    static func isDone(_ c: CookTimerAttributes.Clock, isStale: Bool) -> Bool {
        if c.isDone { return true }
        guard isStale, let end = c.endsAt else { return false }
        return end <= Date()
    }

    /// The counting interval, from where a full timer would have started to its end.
    static func interval(_ c: CookTimerAttributes.Clock, end: Date) -> ClosedRange<Date> {
        end.addingTimeInterval(-Double(max(1, c.total)))...end
    }
}

/// The time, big and gold: counting down, paused, or "Gata".
struct CookCountdown: View {
    let clock: CookTimerAttributes.Clock
    let isStale: Bool
    var size: CGFloat = 46

    var body: some View {
        Group {
            if CookFace.isDone(clock, isStale: isStale) {
                Text("Gata").font(WFont.serif(size * 0.87))
            } else if let end = clock.endsAt {
                Text(timerInterval: CookFace.interval(clock, end: end), countsDown: true)
                    .font(WFont.bold(size).monospacedDigit())
                    .multilineTextAlignment(.trailing)
            } else {
                Text(WidgetRules.clock(clock.left))
                    .font(WFont.bold(size).monospacedDigit())
                    .opacity(0.6)
            }
        }
        .foregroundStyle(Theme.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

/// The thin gold progress line under a timer.
struct CookProgressLine: View {
    let clock: CookTimerAttributes.Clock
    let isStale: Bool

    var body: some View {
        Group {
            if CookFace.isDone(clock, isStale: isStale) {
                ProgressView(value: 1.0)
            } else if let end = clock.endsAt {
                ProgressView(timerInterval: CookFace.interval(clock, end: end), countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
            } else {
                ProgressView(value: Double(max(0, clock.total - clock.left)), total: Double(max(1, clock.total)))
            }
        }
        .progressViewStyle(.linear)
        .tint(Theme.accent)
        .labelsHidden()
    }
}

/// The buttons under one timer: Pauză / Continuă and +1 min, or +1 min and "Pasul 4" once it rang.
struct CookButtons: View {
    let clock: CookTimerAttributes.Clock
    let stepCount: Int
    let isStale: Bool

    var body: some View {
        HStack(spacing: 8) {
            if CookFace.isDone(clock, isStale: isStale) {
                Button(intent: CookTimerAddMinuteIntent(step: clock.step)) { CookPill(title: "+1 min") }
                    .buttonStyle(.plain)
                if let url = WLinks.cook(min(clock.step + 1, stepCount - 1)) {
                    Link(destination: url) {
                        CookPill(title: Self.nextTitle(clock, stepCount: stepCount), gold: true)
                    }
                }
            } else {
                Button(intent: CookTimerPauseIntent(step: clock.step, resume: !clock.isRunning)) {
                    CookPill(title: clock.isRunning ? "Pauză" : "Continuă")
                }
                .buttonStyle(.plain)
                Button(intent: CookTimerAddMinuteIntent(step: clock.step)) { CookPill(title: "+1 min") }
                    .buttonStyle(.plain)
            }
        }
    }
}

extension CookButtons {
    /// "Pasul 4", or "Ultimul pas" on the last step.
    static func nextTitle(_ c: CookTimerAttributes.Clock, stepCount: Int) -> String {
        c.step + 1 < stepCount ? "Pasul \(c.step + 2)" : "Ultimul pas"
    }
}

struct CookPill: View {
    let title: String
    var gold = false

    var body: some View {
        Text(title)
            .font(WFont.semibold(14))
            .foregroundStyle(gold ? Theme.onAccent : Theme.text)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(Capsule().fill(gold ? Theme.accent : Color.white.opacity(0.1)))
    }
}

/// The recipe photo in a circle (nothing without a photo).
struct CookThumb: View {
    let name: String?
    var side: CGFloat = 28
    var corner: CGFloat?

    var body: some View {
        if WPhoto.exists(name) {
            WPhoto(name: name)
                .frame(width: side, height: side)
                .clipShape(RoundedRectangle(cornerRadius: corner ?? side / 2, style: .continuous))
        }
    }
}

/// The Lock Screen card.
struct CookLockView: View {
    let attributes: CookTimerAttributes
    let clocks: [CookTimerAttributes.Clock]
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 9) {
                CookThumb(name: attributes.photo)
                Text(attributes.title)
                    .font(WFont.serif(15.5))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Spacer(minLength: 6)
                Text(CookActivityText.corner(clocks, stepCount: attributes.stepCount))
                    .font(WFont.semibold(12.5))
                    .foregroundStyle(Theme.muted)
            }
            if clocks.count > 1 {
                CookRows(clocks: Array(clocks.prefix(2)), isStale: isStale)
            } else if let clock = clocks.first {
                CookSingle(clock: clock, stepCount: attributes.stepCount, isStale: isStale)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// One timer: what to do now on the left, the time on the right, the line and the buttons.
private struct CookSingle: View {
    let clock: CookTimerAttributes.Clock
    let stepCount: Int
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(clock.title)
                        .font(WFont.semibold(15))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                    detail
                }
                Spacer(minLength: 4)
                CookCountdown(clock: clock, isStale: isStale)
                    .frame(maxWidth: 150, alignment: .trailing)
            }
            .padding(.top, 8)
            CookProgressLine(clock: clock, isStale: isStale).padding(.top, 12)
            CookButtons(clock: clock, stepCount: stepCount, isStale: isStale).padding(.top, 12)
        }
    }

    @ViewBuilder private var detail: some View {
        if CookFace.isDone(clock, isStale: isStale) {
            Text(Self.doneLine(clock)).font(WFont.text(13)).foregroundStyle(Theme.muted)
        } else if !clock.detail.isEmpty {
            Text(clock.detail).font(WFont.text(13)).foregroundStyle(Theme.muted).lineLimit(1)
        }
    }

    /// Under the step once its timer rang.
    static func doneLine(_ c: CookTimerAttributes.Clock) -> String { "s-a terminat timpul" }
}

/// Two timers, one under the other, the one ending first on top; no buttons, so they fit.
private struct CookRows: View {
    let clocks: [CookTimerAttributes.Clock]
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(clocks, id: \.step) { clock in
                VStack(spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Pasul \(clock.step + 1) · \(clock.title)")
                            .font(WFont.semibold(15))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        CookCountdown(clock: clock, isStale: isStale, size: 30)
                            .frame(maxWidth: 110, alignment: .trailing)
                    }
                    CookProgressLine(clock: clock, isStale: isStale)
                }
            }
        }
        .padding(.top, 10)
    }
}

/// The Dynamic Island: photo and time when small, the Lock Screen's buttons when held.
@MainActor
enum CookIsland {
    static func make(attributes: CookTimerAttributes, clocks: [CookTimerAttributes.Clock], isStale: Bool) -> DynamicIsland {
        let first = clocks.first
        return DynamicIsland {
            DynamicIslandExpandedRegion(.leading) {
                CookThumb(name: attributes.photo, side: 42, corner: 12).padding(.leading, 4)
            }
            DynamicIslandExpandedRegion(.trailing) {
                if let first {
                    CookCountdown(clock: first, isStale: isStale, size: 34)
                        .frame(maxWidth: 120, alignment: .trailing)
                        .padding(.trailing, 4)
                }
            }
            DynamicIslandExpandedRegion(.center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(attributes.title).font(WFont.serif(16)).foregroundStyle(Theme.text).lineLimit(1)
                    if let first {
                        Text("Pasul \(first.step + 1) · \(first.title)")
                            .font(WFont.text(12.5))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            DynamicIslandExpandedRegion(.bottom) {
                if let first {
                    VStack(spacing: 12) {
                        CookProgressLine(clock: first, isStale: isStale)
                        CookButtons(clock: first, stepCount: attributes.stepCount, isStale: isStale)
                    }
                    .padding(.top, 8)
                }
            }
        } compactLeading: {
            CookThumb(name: attributes.photo, side: 24)
        } compactTrailing: {
            if let first {
                CookCountdown(clock: first, isStale: isStale, size: 16)
                    .frame(width: 52, alignment: .trailing)
            }
        } minimal: {
            if let first, let end = first.endsAt, !CookFace.isDone(first, isStale: isStale) {
                ProgressView(timerInterval: CookFace.interval(first, end: end), countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.circular)
                .tint(Theme.accent)
            } else {
                Image(systemName: "checkmark").foregroundStyle(Theme.accent)
            }
        }
        .widgetURL(WLinks.cook(first?.step ?? 0))
        .keylineTint(Theme.accent)
    }
}
