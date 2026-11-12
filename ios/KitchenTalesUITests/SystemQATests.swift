import XCTest

/// What the system brings into the app: links (kitchentales://, used by Siri, Shortcuts,
/// Spotlight and the Share card), the Share sheet, going to the background, big text.
@MainActor
final class SystemQATests: QABase {

    /// Opens a kitchentales:// link from outside the app, like the Share card or a Shortcut does.
    private func openLink(_ link: String) {
        guard let url = URL(string: link) else { return }
        XCUIDevice.shared.system.open(url)
        // iOS may ask "Open in Bucătăria?" the first time.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let open = springboard.buttons["Open"]
        if open.waitForExistence(timeout: 3) { open.tap() }
        settle(2)
        log("open link \(link)")
    }

    func testX01_DeepLinks() {
        launch(area: "recipes", tab: "home")
        openLink("kitchentales://list")
        shot("link-list")
        expect("Cumpărături", .staticText, "kitchentales://list opens the shopping list")

        openLink("kitchentales://week")
        shot("link-week")
        expect("SĂPTĂMÂNA MEA", .staticText, exact: false, "kitchentales://week opens the week")

        openLink("kitchentales://recipe/r3")
        settle(1)
        shot("link-recipe")
        expect("Cartofi țărănești", .staticText, "kitchentales://recipe/r3 opens Cartofi țărănești")

        openLink("kitchentales://recipe/does-not-exist")
        shot("link-recipe-missing")
        log("missing recipe link shows: " + screenTexts(limit: 10))

        openLink("kitchentales://story/d3")
        settle(1)
        shot("link-story")
        expect("În căutarea lui Nemo", .staticText, exact: false, "kitchentales://story/d3 opens the player with Nemo")
        swipeDownToClose()

        openLink("kitchentales://story")
        settle(1)
        shot("link-story-last")
        log("story with no id plays: " + screenTexts(limit: 10))
        swipeDownToClose()

        openLink("kitchentales://bedtime")
        settle(1.5)
        shot("link-bedtime")
        log("bedtime link: " + screenTexts(limit: 15))
        tap("Închide", .button, optional: true)

        openLink("kitchentales://nothing-here")
        shot("link-unknown")
        crashCheck(after: "unknown link")
    }

    /// Links while kid mode is on must not open the recipes side.
    func testX02_DeepLinksInKidMode() {
        launch(area: "recipes", tab: "profile")
        tap("Dă-i telefonul copilului", .any, exact: false)
        settle(1.5)
        openLink("kitchentales://recipe/r1")
        shot("kid-link-recipe")
        check(!el("Gătește pas cu pas", .any, exact: false).exists, "a recipe link does not leave kid mode")
        check(el("Surpriză", .button, exact: false).exists, "still in kid mode after a recipe link")
        openLink("kitchentales://list")
        shot("kid-link-list")
        check(!el("Cumpărături", .staticText).exists, "a list link does not leave kid mode")
        openLink("kitchentales://story/d1")
        shot("kid-link-story")
        log("kid mode + story link (Aladdin is outside the kid folders): " + screenTexts(limit: 10))
        check(!el("Aladdin", .staticText).exists, "a story link does not play a story outside the kid folders")
        swipeDownToClose()
        tap("Ieși din modul copil", .button, exact: false)
        for d in ["1", "2", "3", "4"] { tap(d, .button, scroll: false) }
    }

    /// The Share sheet from inside the app: is "Bucătăria" (our Share extension) offered, and what
    /// does it show in a simulator build (unsigned, so no shared sign-in)?
    func testX03_ShareSheet() {
        launch(area: "recipes", tab: "recipes")
        tap("Ciorbă de perișoare", .any, exact: false)
        settle(1)
        tap("Mai multe", .button, pick: .highest)
        tap("Trimite", .button, exact: false)
        settle(2.5)
        shot("share-sheet")
        dumpTree("share-sheet-recipe")
        let ours = el("Bucătăria", .any, exact: false)
        if ours.exists {
            log("our extension is in the Share sheet")
            ours.tap()
            settle(4)
            shot("share-extension")
            dumpTree("share-extension")
            log("extension shows: " + screenTexts(limit: 20))
        } else {
            log("NOTE 'Bucătăria' not in the first row of the Share sheet (may need 'More')")
            let more = el("More", .any)
            if more.exists { more.tap(); settle(2); shot("share-more"); dumpTree("share-more") }
        }
    }

    /// Home button and back: the open recipe and the player state are kept.
    func testX04_BackgroundAndBack() {
        launch(area: "stories", tab: "library")
        tap("Povești Disney", .any, exact: false)
        tap("Aladdin", .any, exact: false)
        settle(1.5)
        shot("before-background")
        XCUIDevice.shared.press(.home)
        settle(2)
        app.activate()
        settle(2)
        shot("after-background")
        check(el("Aladdin", .staticText).exists, "player still shows Aladdin after going to the background and back")
        swipeDownToClose()
        tab("Acasă")
        tap("Rețete", .button, pick: .highest)
        settle(1)
        tab("Rețete")
        tap("Roșii umplute", .any, exact: false)
        settle(1)
        XCUIDevice.shared.press(.home)
        settle(2)
        app.activate()
        settle(2)
        shot("recipe-after-background")
        check(el("Roșii umplute", .staticText).exists, "recipe still open after background")
    }

    /// The main screens with the biggest accessibility text (Dynamic Type AX3).
    func testX05_LargeText() {
        let big = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge"]
        let screens: [(String, String, String?, String)] = [
            ("recipes", "home", nil, "home"),
            ("recipes", "home", "recipe", "recipe"),
            ("recipes", "home", "cook", "cook"),
            ("recipes", "recipes", nil, "recipes"),
            ("recipes", "week", nil, "week"),
            ("recipes", "list", nil, "list"),
            ("recipes", "profile", nil, "profile"),
            ("stories", "home", nil, "stories-home"),
            ("stories", "library", nil, "library"),
            ("stories", "home", "player", "player"),
            ("stories", "add", nil, "add"),
        ]
        for (area, tab, screen, name) in screens {
            launch(area: area, tab: tab, screen: screen, extra: big)
            settle(1)
            shot("ax3-\(name)")
            audit("ax3-\(name)")
        }
        launch(demo: false, extra: big)
        shot("ax3-login")
    }

    /// The main screens at normal text size: run alone on a small iPhone and an iPad.
    func testX07_KeyScreens() {
        let screens: [(String, String, String?, String)] = [
            ("recipes", "home", nil, "home"),
            ("recipes", "home", "recipe", "recipe"),
            ("recipes", "home", "cook", "cook"),
            ("recipes", "recipes", nil, "recipes"),
            ("recipes", "week", nil, "week"),
            ("recipes", "list", nil, "list"),
            ("recipes", "recipes", "editor-edit", "editor"),
            ("recipes", "profile", nil, "profile"),
            ("stories", "home", nil, "stories-home"),
            ("stories", "library", nil, "library"),
            ("stories", "library", "folder", "folder"),
            ("stories", "home", "player", "player"),
            ("stories", "add", nil, "add"),
            ("stories", "home", "kid", "kid"),
            ("stories", "home", "bedtime-night", "bedtime-night"),
        ]
        for (area, tab, screen, name) in screens {
            launch(area: area, tab: tab, screen: screen)
            settle(1)
            shot("key-\(name)")
        }
        launch(demo: false)
        shot("key-login")
    }

    /// Small checks of launch speed.
    func testX06_LaunchTime() {
        let start = Date()
        launch(area: "recipes", tab: "home")
        let ready = el("Caută rețete", .button).waitForExistence(timeout: 20)
        let seconds = Date().timeIntervalSince(start)
        log(String(format: "launch to Acasă ready: %.1f s (demo data, simulator)", seconds))
        check(ready, "Acasă is ready after launch")
    }
}
