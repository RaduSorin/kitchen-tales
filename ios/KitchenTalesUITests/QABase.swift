import XCTest

/// Shared helpers for the QA flows: they drive the app like a tester (tap, type, swipe), write a
/// screenshot after every step and a line per check into $QA_OUT/qa-log.txt, and never stop at
/// the first problem. A check that does not hold is logged as `FAIL` (the run carries on); the
/// test fails at the end if any check failed, so the xcresult shows which flows had problems.
///
/// Run with `TEST_RUNNER_QA_OUT=<dir>` (xcodebuild passes it to the runner as QA_OUT).
@MainActor
class QABase: XCTestCase {
    var app: XCUIApplication!
    private var failures: [String] = []
    private var shotIndex = 0

    static let outDir: String = {
        let dir = ProcessInfo.processInfo.environment["QA_OUT"] ?? (NSTemporaryDirectory() + "qa")
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        return dir
    }()

    /// A short name for the flow, used as the screenshot prefix ("R02" for testR02_…).
    var flow: String {
        let name = String(describing: self.name)          // "-[RecipesQATests testR02_RecipePage]"
        let method = name.split(separator: " ").last.map(String.init) ?? name
        let clean = method.replacingOccurrences(of: "]", with: "").replacingOccurrences(of: "test", with: "")
        return clean
    }

    // MARK: Launch

    /// Starts the app signed in with the made-up demo account (debug builds only).
    func launch(area: String? = nil, tab: String? = nil, screen: String? = nil, demo: Bool = true,
                kid: String = "none", extra: [String] = [], file: StaticString = #filePath, line: UInt = #line) {
        continueAfterFailure = true
        app = XCUIApplication()
        var args: [String] = []
        if demo { args += ["-demo", "YES"] }
        if let area { args += ["-area", area] }
        if let tab { args += ["-tab", tab] }
        if let screen { args += ["-screen", screen] }
        // Kid mode is saved on the phone: a flow that stopped half-way must not leave the next
        // one in kid mode. (Values passed this way only win for this launch.)
        args += ["-kt-kid", kid]
        args += extra
        app.launchArguments = args
        app.launch()
        log("LAUNCH \(args.joined(separator: " "))")
        if !app.wait(for: .runningForeground, timeout: 15) {
            fail("app did not reach the foreground after launch")
        }
        settle(1.5)
    }

    // MARK: Logging

    func log(_ text: String) {
        let line = "[\(flow)] \(text)\n"
        print("QA " + line, terminator: "")
        let path = Self.outDir + "/qa-log.txt"
        if let handle = FileHandle(forWritingAtPath: path) {
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8)!)
            try? handle.close()
        } else {
            FileManager.default.createFile(atPath: path, contents: line.data(using: .utf8))
        }
    }

    func fail(_ text: String) {
        failures.append(text)
        log("FAIL \(text)")
    }

    /// Something a tester would note that is not a broken check (a look, a wording, a timing).
    func observe(_ text: String) { log("NOTE \(text)") }

    @discardableResult
    func check(_ condition: Bool, _ what: String) -> Bool {
        if condition { log("ok   \(what)") } else { fail(what) }
        return condition
    }

    nonisolated override func tearDown() {
        // XCTest calls this on the main thread. The list of failed checks, so the result names them.
        let failed: [String] = MainActor.assumeIsolated {
            if let app = self.app, app.state != .runningForeground {
                self.fail("app is not in the foreground at the end (state \(app.state.rawValue)): crash or exit?")
            }
            let f = self.failures
            self.failures = []
            return f
        }
        super.tearDown()
        if !failed.isEmpty {
            XCTFail("\(failed.count) QA check(s) failed:\n- " + failed.joined(separator: "\n- "))
        }
    }

    // MARK: Screenshots

    /// Saves a screenshot as <flow>-<nn>-<name>.png in QA_OUT and attaches it to the result.
    func shot(_ name: String) {
        shotIndex += 1
        let file = String(format: "%@-%02d-%@", flow, shotIndex, name)
        let image = XCUIScreen.main.screenshot()
        let url = URL(fileURLWithPath: Self.outDir).appendingPathComponent(file + ".png")
        try? image.pngRepresentation.write(to: url)
        let attachment = XCTAttachment(screenshot: image)
        attachment.name = file
        attachment.lifetime = .keepAlways
        add(attachment)
        log("shot \(file)")
        crashCheck(after: name)
    }

    /// The accessibility tree of the screen, for writing the next tests and the report.
    func dumpTree(_ name: String) {
        let url = URL(fileURLWithPath: Self.outDir).appendingPathComponent("tree-\(flow)-\(name).txt")
        try? app.debugDescription.data(using: .utf8)?.write(to: url)
    }

    /// Apple's accessibility audit (contrast, hit areas, Dynamic Type, missing labels) of the
    /// current screen. Every issue is logged as `A11Y`, none fails the test.
    func audit(_ name: String) {
        guard #available(iOS 17.0, *) else { return }
        do {
            var lines: [String] = []
            try app.performAccessibilityAudit { issue in
                // XCTest calls the handler on the main thread.
                let line: String = MainActor.assumeIsolated {
                    let el = issue.element.map { "\($0.elementType.rawValue) '\($0.label)'" } ?? "-"
                    return "A11Y \(name): \(issue.compactDescription) · \(el)"
                }
                lines.append(line)
                return true
            }
            lines.forEach { log($0) }
            if lines.isEmpty { log("A11Y \(name): no issues") }
        } catch {
            log("A11Y \(name): audit could not run: \(error)")
        }
    }

    func crashCheck(after step: String) {
        if app.state != .runningForeground {
            fail("CRASH or exit after '\(step)' (app state \(app.state.rawValue))")
        }
    }

    // MARK: Finding things

    func settle(_ seconds: TimeInterval = 0.8) {
        RunLoop.current.run(until: Date().addingTimeInterval(seconds))
    }

    func predicate(_ label: String, exact: Bool) -> NSPredicate {
        exact ? NSPredicate(format: "label == %@ OR identifier == %@", label, label)
              : NSPredicate(format: "label CONTAINS[c] %@", label)
    }

    /// The first element of `type` with this label (or containing it).
    func el(_ label: String, _ type: XCUIElement.ElementType = .any, exact: Bool = true) -> XCUIElement {
        app.descendants(matching: type).matching(predicate(label, exact: exact)).firstMatch
    }

    /// The hittable match lowest on the screen (the tab bar is lowest), or the first match.
    func lowest(_ label: String, _ type: XCUIElement.ElementType = .button, exact: Bool = true) -> XCUIElement? {
        let all = app.descendants(matching: type).matching(predicate(label, exact: exact)).allElementsBoundByIndex
        let shown = all.filter { $0.exists && $0.isHittable }
        return shown.max(by: { $0.frame.maxY < $1.frame.maxY }) ?? all.first
    }

    /// The hittable match highest on the screen.
    func highest(_ label: String, _ type: XCUIElement.ElementType = .button, exact: Bool = true) -> XCUIElement? {
        let all = app.descendants(matching: type).matching(predicate(label, exact: exact)).allElementsBoundByIndex
        let shown = all.filter { $0.exists && $0.isHittable }
        return shown.min(by: { $0.frame.minY < $1.frame.minY }) ?? all.first
    }

    func exists(_ label: String, _ type: XCUIElement.ElementType = .any, exact: Bool = true, timeout: TimeInterval = 4) -> Bool {
        el(label, type, exact: exact).waitForExistence(timeout: timeout)
    }

    /// Checks that something with this label shows up.
    @discardableResult
    func expect(_ label: String, _ type: XCUIElement.ElementType = .any, exact: Bool = true, timeout: TimeInterval = 4,
                _ what: String? = nil) -> Bool {
        check(exists(label, type, exact: exact, timeout: timeout), what ?? "shows '\(label)'")
    }

    /// Checks that nothing with this label is on screen.
    @discardableResult
    func expectGone(_ label: String, _ type: XCUIElement.ElementType = .any, exact: Bool = true, timeout: TimeInterval = 3,
                    _ what: String? = nil) -> Bool {
        let e = el(label, type, exact: exact)
        let gone = e.waitForNonExistence(timeout: timeout) || !e.isHittable
        return check(gone, what ?? "'\(label)' is gone")
    }

    // MARK: Doing things

    /// Taps the element with this label; scrolls up to 4 times to find it. Logs a FAIL if it is
    /// not there (unless `optional`). Returns whether it tapped.
    @discardableResult
    func tap(_ label: String, _ type: XCUIElement.ElementType = .any, exact: Bool = true, timeout: TimeInterval = 4,
             optional: Bool = false, scroll: Bool = true, pick: Pick = .first, note: String? = nil) -> Bool {
        var target: XCUIElement? = nil
        func find() -> XCUIElement? {
            switch pick {
            case .first:
                let e = el(label, type, exact: exact)
                return e.exists ? e : nil
            case .lowest: return lowest(label, type, exact: exact).flatMap { $0.exists ? $0 : nil }
            case .highest: return highest(label, type, exact: exact).flatMap { $0.exists ? $0 : nil }
            }
        }
        _ = el(label, type, exact: exact).waitForExistence(timeout: timeout)
        target = find()
        // The keyboard (and the tab bar riding on it) covers most of the screen: put it away first.
        if (target == nil || !(target!.isHittable)) && keyboardShown {
            hideKeyboard()
            target = find()
        }
        if scroll {
            var tries = 0
            while (target == nil || !(target!.isHittable)) && tries < 4 {
                app.swipeUp(velocity: .slow)
                settle(0.5)
                target = find()
                tries += 1
            }
            // Not further down: it may be above (a header scrolled away).
            tries = 0
            while (target == nil || !(target!.isHittable)) && tries < 3 {
                app.swipeDown(velocity: .slow)
                settle(0.5)
                target = find()
                tries += 1
            }
        }
        guard let target, target.exists else {
            if optional { log("skip '\(label)' not found") } else { fail("cannot find '\(label)' to tap" + (note.map { " (\($0))" } ?? "")) }
            return false
        }
        if target.isHittable {
            target.tap()
        } else {
            // Present but covered or off screen: tap its centre anyway and note it.
            log("NOTE '\(label)' exists but is not hittable; tapping its centre")
            target.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        log("tap  '\(label)'")
        settle()
        return true
    }

    enum Pick { case first, lowest, highest }

    var keyboardShown: Bool { app.keyboards.firstMatch.exists }

    /// Puts the keyboard away: its Done / Return key for a one-line field, else a tap on the
    /// screen's title area, else a drag down on the content.
    func hideKeyboard() {
        guard keyboardShown else { return }
        let kb = app.keyboards.firstMatch
        let multiLine = app.textViews.matching(NSPredicate(format: "hasKeyboardFocus == true")).count > 0
        if !multiLine {
            for key in ["Done", "done", "Gata", "Return", "return", "Go", "Search"] {
                let b = kb.buttons[key]
                if b.exists && b.isHittable { b.tap(); settle(0.6); if !keyboardShown { log("keyboard hidden with '\(key)'"); return } }
            }
        }
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.13)).tap()
        settle(0.6)
        if !keyboardShown { log("keyboard hidden by tapping the title area"); return }
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62)))
        settle(0.6)
        if keyboardShown { observe("the keyboard cannot be put away on this screen (no Done key, tap and drag do nothing)") }
        else { log("keyboard hidden by dragging the content down") }
    }

    /// A tab of the app's own tab bar (the lowest button with that label).
    @discardableResult
    func tab(_ label: String) -> Bool {
        tap(label, .button, exact: false, scroll: false, pick: .lowest)
    }

    /// Types into the first text field (or the one with this placeholder).
    @discardableResult
    func enter(_ text: String, into placeholder: String? = nil, secure: Bool = false) -> Bool {
        var field: XCUIElement
        if let placeholder {
            let p = NSPredicate(format: "placeholderValue == %@ OR label == %@ OR identifier == %@", placeholder, placeholder, placeholder)
            field = app.textFields.matching(p).firstMatch
            if !field.exists { field = app.textViews.matching(p).firstMatch }
            if !field.exists { field = app.secureTextFields.matching(p).firstMatch }
        } else {
            field = secure ? app.secureTextFields.firstMatch : app.textFields.firstMatch
            if !field.exists { field = app.textViews.firstMatch }
        }
        guard field.waitForExistence(timeout: 4) else {
            fail("no text field \(placeholder.map { "'\($0)'" } ?? "") to type '\(text)'")
            return false
        }
        field.tap()
        settle(0.4)
        field.typeText(text)
        log("type '\(text)'" + (placeholder.map { " into '\($0)'" } ?? ""))
        return true
    }

    /// Back: the app's ‹ buttons (several labels in use), else the system back, else an edge swipe.
    func goBack() {
        for label in ["Înapoi", "Back", "chevron.left", "Go back", "Renunță"] {
            if let b = highest(label, .button), b.exists, b.isHittable, b.frame.minY < 200 {
                b.tap(); settle(); log("back via '\(label)'"); return
            }
        }
        let nav = app.navigationBars.buttons.firstMatch
        if nav.exists && nav.isHittable { nav.tap(); settle(); log("back via nav bar"); return }
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)))
        settle()
        log("back via edge swipe")
    }

    /// Closes a sheet or full-screen page by dragging it down from the top.
    func swipeDownToClose() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
        settle(1)
    }

    /// Closes an open menu or popover by tapping the very top of the screen.
    func dismissMenu() {
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)).tap()
        settle()
    }

    /// Accepts a system permission alert (microphone, notifications) if one is showing.
    func allowSystemAlert() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        if alert.waitForExistence(timeout: 2) {
            log("system alert: \(alert.label)")
            for label in ["Allow", "OK", "Allow While Using App", "Permite", "Permiteți"] {
                let b = alert.buttons[label]
                if b.exists { b.tap(); settle(); return }
            }
            alert.buttons.element(boundBy: alert.buttons.count - 1).tap()
            settle()
        }
    }

    /// The text of the toast at the top ("Am pus 4 ingrediente în listă"), if any shows within `timeout`.
    func toast(containing text: String, timeout: TimeInterval = 4) -> Bool {
        el(text, .staticText, exact: false).waitForExistence(timeout: timeout)
    }

    /// Every static text on screen, joined (for logging what a screen says).
    func screenTexts(limit: Int = 60) -> String {
        app.staticTexts.allElementsBoundByIndex.prefix(limit).map(\.label).filter { !$0.isEmpty }.joined(separator: " | ")
    }

    /// Buttons that VoiceOver would read with no useful name.
    func unlabeledButtons(_ screen: String) {
        let bad = app.buttons.allElementsBoundByIndex.filter { b in
            let l = b.label
            return b.exists && (l.isEmpty || l.contains(".") && !l.contains(" ") && l == l.lowercased())
        }
        if !bad.isEmpty {
            log("A11Y \(screen): \(bad.count) button(s) without a real label: " + bad.prefix(8).map { "'\($0.label)'@\(Int($0.frame.midX)),\(Int($0.frame.midY))" }.joined(separator: ", "))
        }
    }
}
