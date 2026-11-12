import XCTest

/// The stories side with the demo library (10 stories in Povești Disney, Povești de seară,
/// Povești Hachette, Basme and two folders). In demo mode the player opens a story a third of
/// the way in, paused, with no audio.
@MainActor
final class StoriesQATests: QABase {

    /// Opens a library folder by tapping the middle of its card where a person would see it.
    /// The cards' accessibility frames are far bigger than the cards (see qa-1), so XCUITest's own
    /// tap (the frame's centre) misses; here the card's place is worked out from the first card
    /// ("Cântece", empty, so its frame is right) and the 12-point gaps. Logs which folder opened.
    @discardableResult
    func openFolderCard(_ name: String) -> Bool {
        let cards = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", " povești", " poveste")).allElementsBoundByIndex
        let labels = cards.map(\.label)
        guard let index = labels.firstIndex(where: { $0.hasPrefix(name) }),
              let first = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cântece")).allElementsBoundByIndex.first,
              first.frame.height < 200 else {
            fail("cannot place the '\(name)' card (cards: \(labels.joined(separator: " | ")))")
            return false
        }
        let cardIndex = index   // Cântece is card 0 and is in `cards` too ("0 povești")
        let y = first.frame.minY + CGFloat(cardIndex) * 144 + 66
        log("tap the '\(name)' card at its visible centre (y \(Int(y)); its accessibility frame is \(cards[index].frame))")
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: first.frame.midX, dy: y)).tap()
        settle(1.2)
        let title = app.navigationBars.firstMatch.identifier
        log("opened: nav bar '\(title)' · " + screenTexts(limit: 6))
        return check(title.contains(name) || el(name, .staticText, exact: false).exists && !el("Folder nou", .button).exists,
                     "tapping the middle of the '\(name)' card opens '\(name)' (opened '\(title)')")
    }

    /// Opens a story's player through the library search (does not depend on the folder cards).
    func openStory(_ title: String) {
        launch(area: "stories", tab: "library")
        let field = app.searchFields.firstMatch
        if field.waitForExistence(timeout: 3) {
            field.tap()
            field.typeText(String(title.prefix(6)))
            settle(1)
        }
        tap(title, .any, exact: false, pick: .lowest)
        settle(1.5)
    }

    func testS01_StoriesHome() {
        launch(area: "stories", tab: "home")
        shot("stories-home")
        audit("stories-home")
        dumpTree("stories-home")
        unlabeledButtons("stories-home")
        log("texts: " + screenTexts())
        expect("Povești", .button)
        tap("Colecții", .button, pick: .highest)
        shot("stories-colectii")
        tap("Favorite", .button, pick: .highest)
        shot("stories-favorite")
        log("Favorite on Acasă shows: " + screenTexts(limit: 25))
        _ = tap("Diseară", .button, optional: true, pick: .highest) || tap("Azi", .button, optional: true, pick: .highest)
        shot("stories-tonight")

        // Switch sides and back.
        tap("Rețete", .button, pick: .highest)
        settle(1)
        shot("switched-to-recipes")
        expect("Caută rețete", .button, "recipes Acasă after the switch")
        tap("Povești", .button, pick: .highest)
        settle(1)
        expect("Caută povești", .button, "stories Acasă after switching back")

        tap("Caută povești", .button)
        settle(1)
        shot("stories-search-button")
        log("'Caută povești' opened: " + screenTexts(limit: 15))
    }

    func testS02_Player() {
        launch(area: "stories", tab: "library")
        shot("library")
        audit("library")
        dumpTree("library")
        unlabeledButtons("library")
        log("texts: " + screenTexts())
        openFolderCard("Povești Disney")
        shot("folder-disney")
        dumpTree("folder-disney")
        audit("folder")
        openStory("Regele Leu")
        shot("player")
        audit("player")
        dumpTree("player")
        unlabeledButtons("player")
        expect("Regele Leu", .staticText)
        expect("DIN POVEȘTI DISNEY", .staticText, exact: false)

        // Play / pause
        if tap("Pornește", .button, optional: true) {
            settle(1)
            expect("Pauză", .button, "play turns into pause")
            shot("player-playing")
            tap("Pauză", .button)
        }
        // Speed cycles.
        let speed = el("Viteză", .button, exact: false)
        guard check(speed.waitForExistence(timeout: 3), "the player is open (Viteză button)") else { return }
        let before = speed.label
        tap("Viteză", .button, exact: false)
        check(el("Viteză", .button, exact: false).label != before, "speed changes on tap (\(before) → \(el("Viteză", .button, exact: false).label))")
        for _ in 0..<6 { tap("Viteză", .button, exact: false, scroll: false) }
        log("speed after 7 taps: \(el("Viteză", .button, exact: false).label)")
        // Stop after N stories.
        let stop = el("Oprește după", .button, exact: false).label
        tap("Oprește după", .button, exact: false)
        log("stop-after: \(stop) → \(el("Oprește după", .button, exact: false).label)")
        // Shuffle
        tap("Una după alta", .button, exact: false, optional: true)
        expect("Amestecat", .button, exact: false, "shuffle on")
        shot("player-options")
        // Remaining / total
        tap("Arată timpul rămas", .button, optional: true)
        shot("player-remaining")
        // Next story
        tap("Povestea următoare", .button, exact: false)
        settle(1)
        shot("player-next")
        log("after next: " + screenTexts(limit: 12))
        // Heart
        let heart = el("favorite", .button, exact: false)
        let h = heart.label
        heart.tap(); settle()
        log("heart: \(h) → \(el("favorite", .button, exact: false).label)")

        // ⋯ of the story
        if tap("Mai multe", .button, pick: .highest) {
            shot("player-more")
            dumpTree("player-more")
            expect("Mută în folder", .button, exact: false)
            expect("Coperta", .button, exact: false)
            expect("Șterge povestea", .button, exact: false)
            tap("Mută în folder", .button, exact: false)
            settle(1)
            shot("move-to-folder")
            audit("move-to-folder")
            _ = tap("Renunță", .button, optional: true) || tap("Gata", .button, optional: true)
            settle()
            tap("Mai multe", .button, pick: .highest)
            tap("Coperta", .button, exact: false)
            settle(1)
            shot("cover-sheet")
            audit("cover-sheet")
            swipeDownToClose()
            tap("Mai multe", .button, pick: .highest)
            tap("Recitește cu altă voce", .button, exact: false, optional: true)
            settle(1)
            shot("renarrate")
            swipeDownToClose()
            tap("Mai multe", .button, pick: .highest)
            tap("Șterge povestea", .button, exact: false)
            shot("delete-story-confirm")
            _ = tap("Nu", .button, optional: true) || tap("Renunță", .button, optional: true)
        }

        // Close to the mini-player.
        tap("Înapoi la", .button, exact: false, pick: .highest)
        settle(1)
        shot("mini-player")
        expect("Înapoi 15 secunde", .button, "mini-player shows")
        // Tap the mini-player to reopen.
        let mini = el("Înapoi 15 secunde", .button)
        if mini.exists {
            let left = mini.coordinate(withNormalizedOffset: CGVector(dx: -3.5, dy: 0.5))
            left.tap()
            settle(1)
            shot("player-reopened")
            check(el("Viteză", .button, exact: false).exists, "tapping the mini-player opens the player")
            swipeDownToClose()
            shot("player-swiped-down")
            check(!el("Viteză", .button, exact: false).exists || !el("Viteză", .button, exact: false).isHittable, "drag down closes the player")
        }
        // The mini-player stays on the recipes side too.
        tab("Acasă")
        tap("Rețete", .button, pick: .highest)
        settle(1)
        shot("mini-player-on-recipes")
        expect("Înapoi 15 secunde", .button, "mini-player stays when switching to recipes")
    }

    func testS02b_StoryText() {
        openStory("Ursulețul și luna")
        shot("player-ursuletul")
        dumpTree("player-ursuletul")
        tap("Mai multe", .button, pick: .highest)
        tap("Textul poveștii", .button, exact: false)
        settle(1)
        shot("story-text")
        expect("A fost odată un ursuleț", .any, exact: false, "story text shows")
        audit("story-text")
    }

    func testS03_LibraryFolders() {
        launch(area: "stories", tab: "library")
        tap("Folder nou", .button)
        settle(1)
        shot("folder-new")
        audit("folder-new")
        enter("Folder QA", into: "Muzică pentru copii")
        tap("🐻", .button, optional: true)
        tap("Creează folderul", .button)
        settle(1.5)
        shot("folder-created")
        expect("Folder QA", .any, exact: false, "new folder shows in the library")

        app.swipeDown(); app.swipeDown(); settle()
        if !openFolderCard("Povești Disney") {
            goBack()
            launch(area: "stories", tab: "library", screen: "folder")
            log("opened the first folder with -screen folder instead")
        }
        for look in ["Raft", "Cover Flow", "Listă", "Pătrate"] {
            if tap("Vizualizare", .button, exact: false, optional: true) {
                tap(look, .any, pick: .highest)
                settle(1)
                shot("folder-look-\(look.replacingOccurrences(of: " ", with: "-"))")
            }
        }
        if tap("Caută în Povești Disney", .any, exact: false, optional: true) || app.searchFields.firstMatch.exists {
            let field = app.searchFields.firstMatch.exists ? app.searchFields.firstMatch : app.textFields.firstMatch
            field.tap()
            field.typeText("leu")
            settle(1)
            shot("folder-search")
            expect("Regele Leu", .any, exact: false, "folder search finds Regele Leu")
            check(!el("Aladdin", .any, exact: false).isHittable, "folder search hides Aladdin")
        }
        tap("Mai multe", .button, pick: .highest)
        shot("folder-more")
        dumpTree("folder-more")
        if tap("Partajează folderul", .button, exact: false, optional: true) {
            shot("folder-share-dialog")
            tap("Renunță", .button)
        }
        tap("Mai multe", .button, pick: .highest)
        tap("Redenumește", .button, exact: false, optional: true)
        settle(1)
        shot("folder-rename")
        swipeDownToClose()

        // Context menu of a story.
        let story = el("Aladdin", .any, exact: false)
        if story.waitForExistence(timeout: 2) {
            story.press(forDuration: 1.2)
            settle(1)
            shot("story-context-menu")
            dismissMenu()
        }
        // Add a story into this folder.
        if tap("Adaugă o poveste în folder", .button, optional: true) {
            shot("folder-add-menu")
            dismissMenu()
        }
    }

    func testS04_Favorites() {
        launch(area: "stories", tab: "favorites")
        shot("favorites")
        audit("favorites")
        dumpTree("favorites")
        log("texts: " + screenTexts())
        expect("Aladdin", .any, exact: false)
        let hearts = app.buttons.matching(NSPredicate(format: "label == %@", "Scoate de la favorite"))
        log("hearts on Favorite: \(hearts.count)")
        if hearts.count > 0 {
            hearts.element(boundBy: 0).tap()
            settle(1)
            shot("favorites-after-unheart")
            log("after un-heart: " + screenTexts())
        }
    }

    func testS05_AddStory() {
        launch(area: "stories", tab: "add")
        shot("add")
        audit("add")
        dumpTree("add")
        expect("Poveste nouă", .staticText)

        tap("Creează o poveste", .any, exact: false)
        settle(1)
        shot("create-1")
        dumpTree("create-1")
        audit("create")
        log("texts: " + screenTexts())
        tap("aventură", .button, exact: false, optional: true, scroll: false)
        tap("Mai departe", .button, exact: false)
        shot("create-2")
        log("texts: " + screenTexts())
        tap("Mai departe", .button, exact: false)
        shot("create-3")
        log("texts: " + screenTexts())
        tap("Mai departe", .button, exact: false)
        shot("create-4")
        dumpTree("create-4")
        log("texts: " + screenTexts())
        enter("Povestea de test")
        shot("create-title")
        tap("Creează povestea", .button, exact: false)
        settle(5)
        shot("create-generating")
        log("after Creează: " + screenTexts())
        // Back out.
        tap("Înapoi", .button, optional: true)
        tap("Înapoi", .button, optional: true)
        tap("Închide", .button, optional: true)
        settle(1)

        if !el("Citește tu", .any, exact: false).isHittable { launch(area: "stories", tab: "add") }
        tap("Citește tu", .any, exact: false)
        allowSystemAlert()
        settle(1)
        shot("record")
        dumpTree("record")
        audit("record")
        if tap("Începe înregistrarea", .button, optional: true) {
            allowSystemAlert()
            settle(3)
            shot("recording")
            log("recording: " + screenTexts())
            dumpTree("recording")
            tap("Înapoi", .button, optional: true)
            settle(1)
            shot("record-leave-confirm")
            if exists("Pleci fără să salvezi?", .any, timeout: 2) {
                tap("Pleacă și renunță", .button)
            }
        } else {
            tap("Înapoi", .button, optional: true)
        }
        settle(1)
        if !el("Încarcă un fișier", .any, exact: false).isHittable { launch(area: "stories", tab: "add") }
        tap("Încarcă un fișier", .any, exact: false)
        settle(1)
        shot("upload")
        audit("upload")
        tap("Alege un fișier audio", .any, exact: false)
        settle(2)
        shot("upload-picker")
        let cancel = el("Cancel", .button)
        if cancel.exists { cancel.tap() }
    }

    // MARK: Kid mode

    func testS06_KidMode() {
        launch(area: "recipes", tab: "profile")
        shot("profile")
        tap("Dă-i telefonul copilului", .any, exact: false)
        settle(1.5)
        shot("kid-home")
        audit("kid-home")
        dumpTree("kid-home")
        expect("Surpriză", .button, exact: false, "kid mode tab Surpriză")
        expect("Caută", .button, exact: false, "kid mode tab Caută")
        check(!el("Rețete", .button).exists, "no Rețete / Povești switch in kid mode")
        check(!el("Profil", .button, exact: false).exists, "no Profil tab in kid mode")
        log("texts: " + screenTexts())
        // Only the kid folders (Povești de seară, Basme) should be shown.
        tab("Bibliotecă")
        settle(1)
        shot("kid-library")
        log("kid library: " + screenTexts())
        check(!el("Povești Disney", .any, exact: false).exists, "kid library hides folders not chosen for the child (Povești Disney)")

        tab("Caută")
        settle(1)
        shot("kid-search")
        enter("tren")
        settle(1)
        shot("kid-search-tren")
        expect("Trenulețul curajos", .any, exact: false, "kid search finds a story in a kid folder")
        app.textFields.firstMatch.clearAndType("Aladdin")
        settle(1)
        shot("kid-search-aladdin")
        check(!el("Aladdin", .button, exact: false).exists, "kid search does not show stories outside the kid folders (Aladdin)")

        tab("Surpriză")
        settle(1.5)
        shot("kid-surprise")
        log("surprise: " + screenTexts(limit: 10))
        check(!el("Mai multe", .button).exists, "no ⋯ menu in the player in kid mode")
        swipeDownToClose()

        // Exit with a wrong PIN, then the right one.
        tap("Ieși din modul copil", .button, exact: false)
        settle(1)
        shot("kid-pin")
        audit("kid-pin")
        for d in ["0", "0", "0", "0"] { tap(d, .button, scroll: false) }
        settle(1)
        shot("kid-pin-wrong")
        expect("PIN greșit", .any, exact: false, "wrong PIN message")
        // Relaunch: kid mode must survive closing the app.
        app.terminate()
        app.launchArguments = ["-demo", "YES"]
        app.launch()
        settle(2)
        shot("kid-after-relaunch")
        check(el("Surpriză", .button, exact: false).exists, "kid mode stays on after the app is closed and opened")
        tap("Ieși din modul copil", .button, exact: false)
        for d in ["1", "2", "3", "4"] { tap(d, .button, scroll: false) }
        settle(1.5)
        shot("kid-exited")
        expect("Profil", .button, exact: false, "after the right PIN the parent tabs are back")
    }

    // MARK: Ora de culcare

    func testS07_Bedtime() {
        launch(area: "recipes", tab: "profile")
        tap("5 ani", .any, exact: false, note: "the child row (Ana, 5 ani)")
        settle(1)
        shot("child")
        audit("child")
        dumpTree("child")
        tap("Ora de culcare", .any, exact: false)
        settle(1)
        shot("bedtime-settings")
        audit("bedtime-settings")
        dumpTree("bedtime-settings")
        log("texts: " + screenTexts())
        tap("Rutina de seară", .switch, exact: false, optional: true)
        allowSystemAlert()
        settle(1)
        shot("bedtime-on")
        tap("Încearcă acum ecranul de noapte", .any, exact: false)
        settle(2)
        shot("bedtime-night")
        audit("bedtime-night")
        dumpTree("bedtime-night")
        log("night: " + screenTexts())
        tap("Pornește poveștile", .any, exact: false)
        settle(2)
        shot("bedtime-started")
        log("after start: " + screenTexts(limit: 15))
        swipeDownToClose()
        tap("Închide", .button, optional: true)
        settle(1)
        shot("bedtime-closed")
    }
}
