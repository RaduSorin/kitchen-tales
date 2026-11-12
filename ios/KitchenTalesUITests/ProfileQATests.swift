import XCTest

/// Profil (both sides), family, preferences, the phone page, the badges, and the login screens.
@MainActor
final class ProfileQATests: QABase {

    func testP01_Profile() {
        launch(area: "recipes", tab: "profile")
        shot("profile")
        audit("profile")
        dumpTree("profile")
        unlabeledButtons("profile")
        log("texts: " + screenTexts())
        expect("Sorin", .staticText, exact: false)
        app.swipeUp()
        settle()
        shot("profile-scrolled")

        // Rename.
        app.swipeDown()
        tap("Schimbă-ți numele", .button)
        shot("rename-alert")
        let field = app.alerts.textFields.firstMatch
        if check(field.waitForExistence(timeout: 3), "rename alert has a text field") {
            field.clearAndType("Sorin QA")
            tap("Salvează", .button)
            settle(1)
            expect("Sorin QA", .staticText, exact: false, "new name shows on Profil")
            shot("renamed")
        }

        // Sign out asks first; cancel.
        tap("Ieși din cont", .button)
        shot("signout-confirm")
        log("sign-out confirm: " + screenTexts(limit: 10) + " / buttons: " + app.buttons.allElementsBoundByIndex.prefix(12).map(\.label).joined(separator: " | "))
        let cancel = el("Cancel", .button).exists ? el("Cancel", .button) : el("Renunță", .button)
        if cancel.exists { cancel.tap() } else { dismissMenu() }
        settle()
        check(el("Profil", .button, exact: false).exists, "still signed in after cancelling sign-out")
    }

    func testP02_FamilyAndInvite() {
        launch(area: "recipes", tab: "profile")
        tap("Familie și partajare", .any, exact: false)
        settle(1)
        shot("family")
        audit("family")
        dumpTree("family")
        log("texts: " + screenTexts())
        tap("Invită pe cineva", .button)
        settle(1)
        shot("invite")
        audit("invite")
        let send = el("Trimite", .button)
        check(send.exists && !send.isEnabled, "Trimite is disabled with no e-mail")
        enter("nu-e-email")
        check(!el("Trimite", .button).isEnabled, "Trimite stays disabled for text without @")
        app.textFields.firstMatch.clearAndType("a@")
        shot("invite-bad-email")
        log("Trimite enabled for 'a@': \(el("Trimite", .button).isEnabled)")
        tap("Renunță", .button, pick: .highest)
        settle()
        tap("Persoane", .any, exact: false, optional: true)
        settle(1)
        shot("people")
        log("people: " + screenTexts())
        goBack()
        if tap("Ce partajez", .any, exact: false, optional: true) || tap("Partajare", .any, exact: false, optional: true) {
            settle(1)
            shot("sharing")
            dumpTree("sharing")
            log("sharing: " + screenTexts())
        }
    }

    func testP03_PrefsAndCookbook() {
        launch(area: "recipes", tab: "profile")
        tap("Bucătărie și povești", .any, exact: false)
        settle(1.5)
        shot("prefs")
        audit("prefs")
        dumpTree("prefs")
        log("texts: " + screenTexts())
        if tap("+ Alt aparat", .any, exact: false, optional: true) {
            shot("prefs-add-tool")
            let f = app.alerts.textFields.firstMatch
            if f.waitForExistence(timeout: 2) { f.typeText("Wok electric"); tap("Adaugă", .button, pick: .lowest) }
            settle()
            expect("Wok electric", .any, exact: false, "new kitchen tool shows")
        }
        app.swipeUp()
        shot("prefs-scrolled")
        app.swipeUp()
        shot("prefs-scrolled-2")
        if tap("Caietul de rețete", .any, exact: false) {
            settle(2)
            shot("cookbook")
            audit("cookbook")
            dumpTree("cookbook")
            log("cookbook: " + screenTexts())
        }
    }

    func testP04_PhoneAndCatalog() {
        launch(area: "recipes", tab: "profile")
        tap("Pe acest telefon", .any, exact: false)
        settle(1)
        shot("phone")
        audit("phone")
        log("texts: " + screenTexts())
        let toggle = app.switches.firstMatch
        if toggle.exists {
            let before = toggle.value as? String
            toggle.tap()
            settle()
            log("Clic pe raft: \(before ?? "?") → \(toggle.value as? String ?? "?")")
            toggle.tap()
        }
        tap("Componente de design", .any, exact: false)
        settle(1)
        shot("catalog")
        app.swipeUp(); shot("catalog-2")
        app.swipeUp(); shot("catalog-3")
    }

    func testP05_ChildSettings() {
        launch(area: "recipes", tab: "profile")
        tap("5 ani", .any, exact: false, note: "the child row (Ana, 5 ani)")
        settle(1)
        shot("child")
        audit("child")
        dumpTree("child")
        log("texts: " + screenTexts())
        app.swipeUp(); shot("child-2")
        app.swipeUp(); shot("child-3")
        if tap("PIN pentru ieșire", .any, exact: false, optional: true) {
            settle(1)
            shot("child-pin")
            dumpTree("child-pin")
            tap("Renunță", .button, optional: true)
        }
    }

    /// qa-1: the app stopped twice while Apple's accessibility audit ran over the "Numele tău"
    /// rename alert (P05 and S07 tapped the profile header by mistake). Same steps, on purpose.
    func testP05b_RenameAlertAudit() {
        launch(area: "recipes", tab: "profile")
        tap("Schimbă-ți numele", .button)
        settle(1)
        shot("rename-alert")
        audit("rename-alert")
        settle(2)
        crashCheck(after: "audit of the rename alert")
        shot("after-audit")
        dumpTree("rename-alert")
        crashCheck(after: "tree of the rename alert")
        tap("Renunță", .button, optional: true, scroll: false)
        settle(1)
        shot("after-cancel")
    }

    func testP06_Badges() {
        launch(area: "recipes", tab: "profile")
        // The badge cards under the name: the passport (recipes) and the album (stories).
        let cards = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", " din "))
        log("badge cards: " + cards.allElementsBoundByIndex.map(\.label).joined(separator: " | "))
        if cards.count > 0 {
            cards.element(boundBy: 0).tap()
            settle(1.5)
            shot("badges-1")
            audit("badges-1")
            dumpTree("badges-1")
            let page = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
            page.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)))
            settle(1.5)
            shot("badges-1-page2")
            page.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)))
            settle(1.5)
            shot("badges-1-page3")
            goBack()
        }
        if cards.count > 1 {
            cards.element(boundBy: 1).tap()
            settle(1.5)
            shot("badges-2")
            audit("badges-2")
            let page = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
            page.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)))
            settle(1.5)
            shot("badges-2-page2")
            goBack()
        }
        // Profil on the stories side (night look).
        launch(area: "stories", tab: "profile")
        shot("stories-profile")
        audit("stories-profile")
    }

    // MARK: Login (signed out: no -demo)

    func testP07_Login() {
        launch(demo: false)
        shot("login")
        audit("login")
        dumpTree("login")
        unlabeledButtons("login")
        log("texts: " + screenTexts())
        let go = el("Intră în cont", .button)
        check(go.exists && !go.isEnabled, "'Intră în cont' disabled while e-mail and password are empty")
        enter("qa-test@example.invalid", into: "E-mail")
        let pw = app.secureTextFields.firstMatch
        if check(pw.waitForExistence(timeout: 2), "password field") {
            pw.tap()
            pw.typeText("Gresit123!")
        }
        tap("Arată parola", .button, optional: true)
        shot("login-filled")
        tap("Intră în cont", .button)
        settle(12)
        shot("login-wrong")
        log("after wrong sign-in: " + screenTexts())
        check(el("Profil", .button, exact: false).exists == false, "wrong credentials do not sign in")
        tap("Ai uitat parola?", .button)
        settle(1)
        shot("forgot")
        audit("forgot")
        log("forgot: " + screenTexts())
        tap("Înapoi la intrare", .button)
        settle(1)
        shot("back-to-login")
        expect("Intră în cont", .button)
    }
}
