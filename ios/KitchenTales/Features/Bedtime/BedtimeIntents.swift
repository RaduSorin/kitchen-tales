import AppIntents

/// "Ora de culcare" from Siri, a Shortcut or the Action button: the night screen.
struct BedtimeIntent: AppIntent {
    static let title: LocalizedStringResource = "Ora de culcare"
    static let description = IntentDescription("Deschide ecranul de noapte cu poveștile de seară.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppCommands.shared.pending = .bedtime
        return .result()
    }
}

/// Settings › Focus › Sleep › Focus filters › Bucătăria: when Sleep starts, the bedtime reminder
/// comes right away (iOS calls this again with nothing set when Sleep ends).
struct BedtimeFocusFilter: SetFocusFilterIntent {
    static let title: LocalizedStringResource = "Ora de culcare"
    static let description = IntentDescription("Când pornește modul Somn, primești mementoul pentru poveștile de seară.")

    @Parameter(title: "Trimite mementoul")
    var remind: Bool?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: remind == true ? "Memento pentru Ora de culcare" : "Fără memento")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        if remind == true, Bedtime.shared.settings.withSleepFocus { await Bedtime.shared.remindNow() }
        return .result()
    }
}
