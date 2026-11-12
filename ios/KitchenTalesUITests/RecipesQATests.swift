import XCTest

/// The recipes side, driven like a tester with the demo kitchen (8 recipes, a week plan and a
/// shopping list of 7 open lines and 2 in the basket).
@MainActor
final class RecipesQATests: QABase {

    /// Opens a recipe from the Rețete tab (grid) by its title.
    private func openRecipe(_ title: String) {
        launch(area: "recipes", tab: "recipes")
        tap(title, .any, exact: false, note: "recipe tile")
        settle(1)
    }

    // MARK: Acasă

    func testR01_Home() {
        launch(area: "recipes", tab: "home")
        shot("home-azi")
        audit("home-azi")
        dumpTree("home-azi")
        unlabeledButtons("home-azi")
        expect("Rețete", .button, "Rețete / Povești switch shows")
        expect("Povești", .button)
        log("texts: " + screenTexts())

        // Hero: swipe between today's dishes.
        let top = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.3))
        top.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.3)))
        settle(1)
        shot("home-hero-swiped")

        tap("Săptămâna", .button, pick: .highest)
        shot("home-saptamana")
        tap("Caiet", .button, pick: .highest)
        shot("home-caiet")
        expect("Recente", .staticText, exact: false)
        app.swipeUp()
        settle()
        shot("home-caiet-scrolled")
        expect("Caietul meu", .staticText, exact: false)
        if tap("Ciorbe și supe", .any, exact: false, optional: true) {
            shot("category-page")
            expect("Supă cremă de cartofi", .any, exact: false, "category page lists its recipes")
            goBack()
        }

        // Search from the glass button.
        app.swipeDown(); app.swipeDown()
        tap("Caută rețete", .button)
        shot("search-empty")
        dumpTree("search")
        enter("cartofi")
        settle(1)
        shot("search-cartofi")
        expect("Cartofi țărănești", .any, exact: false, "search 'cartofi' finds Cartofi țărănești")
        expect("Supă cremă de cartofi", .any, exact: false, "search 'cartofi' finds the soup by title")
        // Without diacritics, as people type on a phone.
        app.textFields.firstMatch.clearAndType("ciorba")
        settle(1)
        shot("search-ciorba-no-diacritics")
        expect("Ciorbă de perișoare", .any, exact: false, "search without diacritics ('ciorba') still finds 'Ciorbă'")
        app.textFields.firstMatch.clearAndType("orez")
        settle(1)
        shot("search-ingredient")
        expect("Roșii umplute", .any, exact: false, "search by ingredient ('orez') finds Roșii umplute")
        app.textFields.firstMatch.clearAndType("xyzqw")
        settle(1)
        shot("search-nothing")
        expect("Nimic nu se potrivește", .staticText, exact: false, "empty search result message")
        app.textFields.firstMatch.clearAndType("chifle")
        settle(1)
        if tap("Chifle de casă", .any, exact: false) {
            shot("search-opened-recipe")
            expect("Gătește pas cu pas", .any, exact: false, "recipe opens from search")
            goBack()
        }
        shot("search-after-back")
    }

    // MARK: A recipe page

    func testR02_RecipePage() {
        openRecipe("Ciorbă de perișoare")
        shot("recipe")
        audit("recipe")
        dumpTree("recipe")
        unlabeledButtons("recipe")
        expect("Ciorbă de perișoare", .staticText)
        expect("4 porții", .staticText, exact: false)
        log("texts: " + screenTexts())

        // Servings scale the amounts.
        tap("Mai multe porții", .button)
        tap("Mai multe porții", .button)
        expect("6 porții", .staticText, exact: false, "servings go to 6")
        expect("750 g carne tocată", .any, exact: false, "500 g carne × 1.5 = 750 g")
        shot("recipe-6-portions")
        tap("Mai puține porții", .button)
        tap("Mai puține porții", .button)
        expect("4 porții", .staticText, exact: false, "servings back to 4")
        // Lower bound.
        for _ in 0..<5 { tap("Mai puține porții", .button, optional: true, scroll: false) }
        expect("1 porție", .staticText, exact: false, "servings stop at 1 porție")
        shot("recipe-1-portion")
        for _ in 0..<3 { tap("Mai multe porții", .button, scroll: false) }
        expect("4 porții", .staticText, exact: false)

        // Tick one ingredient that is not on the list yet: it must not go to the list.
        tap("3 linguri orez", .any, exact: false)
        expect("Ce ai bifat nu ajunge", .staticText, exact: false, "hint after ticking an ingredient")
        shot("recipe-ticked")
        tap("Pune în listă", .button, pick: .lowest)
        let added3 = toast(containing: "Am pus 3")
        let added4 = el("Am pus 4", .staticText, exact: false).exists
        shot("recipe-put-on-list")
        log("toast after Pune în listă: " + screenTexts(limit: 8))
        check(added3, "ticked ingredient is left out: expected 'Am pus 3 ingrediente' (3 new of 4, one ticked), got \(added4 ? "'Am pus 4'" : "other")")
        // The real proof: is the ticked "3 linguri orez" on the shopping list?
        tab("Listă")
        settle(1)
        shot("list-after-ticked-put")
        check(!el("orez", .any, exact: false).exists, "the ticked '3 linguri orez' is not on the shopping list")
        log("list after Pune în listă: " + screenTexts(limit: 30))
        openRecipe("Ciorbă de perișoare")

        // Pași
        app.swipeDown()
        tap("Pași", .button)
        shot("recipe-steps")
        tap("Toacă ceapa", .any, exact: false)
        shot("recipe-step-done")

        // Note
        tap("Note", .button)
        shot("recipe-notes")
        expect("Notele noastre", .staticText)
        expect("Data viitoare mai mult leuștean", .staticText, exact: false, "family note from Loredana shows")
        tap("Adaugă o notă", .button)
        enter("Nota QA de test")
        shot("recipe-note-typing")
        // The note's Salvează sits low on the screen, near the "Gătește pas cu pas" bar.
        let save = el("Salvează", .button)
        check(save.exists && save.isHittable, "the note's Salvează can be tapped with the keyboard up (frame \(save.frame))")
        check(el("Gata", .button).exists, "a 'Gata' button above the keyboard for the multi-line note")
        tap("Salvează", .button)
        settle(1)
        if el("Închide modul de gătit", .button).exists {
            fail("tapping the note's 'Salvează' opened cook mode (the bottom bar covers it)")
            shot("recipe-note-save-opened-cook")
            tap("Închide modul de gătit", .button)
        }
        expect("Nota QA de test", .staticText, exact: false, "new note shows")
        shot("recipe-note-added")
        tap("Șterge nota", .button, optional: true, pick: .highest)
        expectGone("Nota QA de test", .staticText, exact: false, timeout: 3, "note deleted")

        // Favorite (r1 is a favourite). Start again so a stuck step above does not hide these.
        openRecipe("Ciorbă de perișoare")
        tap("Scoate din favorite", .button)
        check(toast(containing: "Scoasă din favorite"), "toast 'Scoasă din favorite'")
        expect("Pune la favorite", .button, "heart switches to 'Pune la favorite'")
        tap("Pune la favorite", .button)

        // În săptămână
        tap("Pune în săptămână", .button, pick: .lowest)
        shot("recipe-day-picker")
        expect("Când o gătești?", .any)
        tap("Mâine", .any)
        check(toast(containing: "Adăugată mâine"), "toast 'Adăugată mâine.'")
        shot("recipe-planned-tomorrow")

        // ⋯
        tap("Mai multe", .button, pick: .highest)
        shot("recipe-more-menu")
        expect("Editează rețeta", .button, exact: false)
        expect("Trimite", .button, exact: false)
        expect("Șterge rețeta", .button, exact: false)
        expect("Oprește partajarea", .button, exact: false, "shared recipe offers 'Oprește partajarea'")
        tap("Editează rețeta", .button, exact: false)
        settle(1)
        shot("recipe-editor-open")
        dumpTree("editor-edit")
        audit("editor-edit")
        expect("Salvează rețeta", .button, exact: false)
        goBack()
        settle(1)
        shot("recipe-after-editor")
        expect("Gătește pas cu pas", .any, exact: false, "back on the recipe after closing the editor untouched")
    }

    /// A recipe from another account: no edit or delete.
    func testR02b_OtherAccountRecipe() {
        openRecipe("Plăcinta Anei")
        shot("other-recipe")
        expect("DE LA ANA", .staticText, exact: false, "kicker says it comes from Ana")
        tap("Mai multe", .button, pick: .highest)
        shot("other-recipe-menu")
        check(!el("Editează rețeta", .button, exact: false).exists, "no 'Editează rețeta' for another account's recipe")
        check(!el("Șterge rețeta", .button, exact: false).exists, "no 'Șterge rețeta' for another account's recipe")
        dismissMenu()
    }

    // MARK: Cooking mode

    func testR03_CookMode() {
        openRecipe("Ciorbă de perișoare")
        tap("Gătește pas cu pas", .any, exact: false, pick: .lowest)
        settle(1)
        shot("cook-step1")
        audit("cook")
        dumpTree("cook")
        unlabeledButtons("cook")
        expect("1 din 6", .staticText, exact: false)
        tap("Pasul următor", .any)
        tap("Pasul următor", .any)
        shot("cook-step3-timer")
        expect("3 din 6", .staticText, exact: false)
        // Step 3 says "15 minute": a timer shows.
        let timer = el("Timer de", .any, exact: false)
        if check(timer.waitForExistence(timeout: 3), "step with '15 minute' shows a timer") {
            timer.tap()
            allowSystemAlert()
            settle(2)
            shot("cook-timer-running")
            expect("mai sunt", .any, exact: false, "timer runs")
        }
        tap("Ingrediente", .any, exact: false)
        settle(1)
        shot("cook-ingredients")
        expect("TOATĂ REȚETA", .any, exact: false)
        swipeDownToClose()
        tap("Pasul anterior", .any)
        expect("2 din 6", .staticText, exact: false, "previous step works")
        // Close in the middle, then the recipe offers to continue.
        tap("Închide modul de gătit", .button)
        settle(1)
        shot("cook-closed-midway")
        expect("Continuă să gătești", .any, exact: false, "recipe offers 'Continuă să gătești' after leaving cook mode midway")
        tap("Continuă să gătești", .any, exact: false, pick: .lowest)
        settle(1)
        expect("2 din 6", .staticText, exact: false, "cook mode resumes on step 2")
        for _ in 0..<4 { tap("Pasul următor", .any) }
        shot("cook-last-step")
        tap("Pasul următor", .any)
        settle(1)
        shot("cook-finished")
        expect("Poftă bună!", .staticText, "finish page")
        enter("Nota din modul de gătit")
        tap("Salvează nota și închide", .button)
        settle(1)
        shot("cook-after-finish")
        expect("de 2 ori", .staticText, exact: false, "recipe says it was cooked twice (once before in demo)")
        tap("Note", .button)
        expect("Nota din modul de gătit", .staticText, exact: false, "note from cook mode is on the recipe")
        shot("cook-note-on-recipe")
    }

    // MARK: Săptămâna

    func testR04_Week() {
        launch(area: "recipes", tab: "week")
        shot("week")
        audit("week")
        dumpTree("week")
        unlabeledButtons("week")
        log("texts: " + screenTexts())
        expect("SĂPTĂMÂNA MEA", .staticText, exact: false)

        // Add to today.
        if tap("Adaugă o rețetă azi", .button, exact: false) {
            shot("week-add-sheet")
            dumpTree("week-add")
            tap("Pune Cartofi țărănești în ziua asta", .button, exact: false)
            expect("Pusă în ziua asta", .button, exact: false, "+ turns into 'Pusă'")
            shot("week-add-picked")
            tap("Gata", .button)
        }
        shot("week-after-add")

        // ⋯ of a planned recipe.
        if tap("Opțiuni pentru Suc de portocale", .button, exact: false, optional: true) {
            shot("week-entry-menu")
            tap("Porții", .button, exact: false)
            shot("week-servings-menu")
            tap("4 porții", .button, exact: false, optional: true)
            tap("Opțiuni pentru Suc de portocale", .button, exact: false)
            tap("Mută în altă zi", .button, exact: false)
            shot("week-move-menu")
            dismissMenu()
            launch(area: "recipes", tab: "week")
            tap("Opțiuni pentru Suc de portocale", .button, exact: false)
            shot("week-entry-menu-2")
            dumpTree("week-entry-menu")
            tap("Scoate din ziua asta", .button, exact: false)
            settle(1)
            shot("week-removed")
            check(!el("Suc de portocale", .staticText).exists, "Suc de portocale removed from the day")
        }

        launch(area: "recipes", tab: "week")
        tap("Lista de cumpărături", .button)
        shot("week-list-menu")
        dumpTree("week-list-menu")
        tap("Pune în listă ce gătești în 7 zile", .button, exact: false)
        check(toast(containing: "în listă"), "toast after putting the week on the list")
        shot("week-put-week-on-list")

        tap("Propune cinele săptămânii", .button, pick: .lowest)
        settle(1)
        shot("plan-week-1")
        dumpTree("plan-week")
        audit("plan-week")
        log("texts: " + screenTexts())
        tap("Mai departe", .button, exact: false, optional: true)
        shot("plan-week-2")
        tap("Mai departe", .button, exact: false, optional: true)
        shot("plan-week-3")
        tap("Propune cinele", .button, exact: false, optional: true)
        settle(3)
        shot("plan-week-result")
        log("texts: " + screenTexts())
    }

    // MARK: Listă

    func testR05_ShoppingList() {
        launch(area: "recipes", tab: "list")
        shot("list")
        audit("list")
        dumpTree("list")
        unlabeledButtons("list")
        log("texts: " + screenTexts())
        expect("Cumpărături", .staticText)
        expect("de luat", .staticText, exact: false)
        expect("Listă, ", .button, exact: false, "Listă tab shows a count")

        enter("1 l lapte", into: "Adaugă ceva, ex. 1 l lapte")
        settle(0.6)
        shot("list-typing")
        check(!(lowest("Profil", .button, exact: false)?.isHittable ?? false), "the tab bar steps aside while the keyboard is up")
        tap("Adaugă", .button, pick: .lowest)
        settle(1)
        shot("list-added-milk")
        log("after adding milk: " + screenTexts())
        expect("lapte", .staticText, exact: false)
        // An empty line must not be added.
        app.textFields.firstMatch.tap()
        app.textFields.firstMatch.typeText("   \n")
        settle()
        shot("list-empty-line")

        hideKeyboard()
        shot("list-keyboard-hidden")
        tap("Detergent de vase", .button, exact: false)
        settle(1)
        shot("list-ticked")
        expect("ÎN COȘ · 3", .any, exact: false, "basket shows 3 after ticking one")

        tap("Pe rețete", .button)
        shot("list-by-recipe")
        expect("CIORBĂ DE PERIȘOARE", .any, exact: false, "grouped by recipe")
        tap("Pe raioane", .button)
        shot("list-by-aisle")

        // Swipe to delete.
        let row = el("8 roșii", .any, exact: false)
        if check(row.waitForExistence(timeout: 3), "row '8 roșii' to swipe") {
            row.swipeLeft()
            settle()
            shot("list-swipe")
            tap("Șterge", .button, exact: false)
            expectGone("8 roșii", .any, exact: false, "row deleted by swipe")
        }

        // Basket
        tap("ÎN COȘ", .button, exact: false)
        shot("list-basket-open")
        tap("Golește coșul", .button, pick: .lowest)
        shot("list-empty-basket-confirm")
        tap("Da, golește", .button)
        expectGone("ÎN COȘ", .any, exact: false, "basket emptied")

        // Send
        tap("Opțiuni listă", .button)
        shot("list-menu")
        if tap("Trimite lista", .button, exact: false) {
            settle(2)
            shot("list-share-sheet")
            dumpTree("share-sheet")
            let ours = el("Bucătăria", .any, exact: false).exists
            log("share sheet shows our extension 'Bucătăria': \(ours)")
            swipeDownToClose()
            let close = el("Close", .button)
            if close.exists { close.tap() }
        }

        // Empty everything, then refill from the week.
        tap("Opțiuni listă", .button)
        tap("Golește toată lista", .button, exact: false)
        shot("list-clear-confirm")
        tap("Da, golește tot", .button)
        settle(1)
        expect("Lista e goală.", .staticText, "empty list message")
        shot("list-empty")
        tap("Pune în listă ce gătești în 7 zile", .button, exact: false)
        settle(1)
        check(toast(containing: "în listă"), "toast after refilling from the week")
        shot("list-refilled")
        log("after refill: " + screenTexts())
    }

    // MARK: Rețete

    func testR06_RecipesList() {
        launch(area: "recipes", tab: "recipes")
        shot("recipes-grid")
        audit("recipes-grid")
        dumpTree("recipes-grid")
        unlabeledButtons("recipes-grid")
        expect("Rețetele mele", .staticText)

        enter("cartofi")
        settle(1)
        shot("recipes-search")
        expect("Cartofi țărănești", .any, exact: false)
        check(!el("Ciorbă de perișoare", .any, exact: false).exists, "search hides recipes without 'cartofi'")
        tap("Șterge căutarea", .button)

        tap("Deserturi", .button, exact: false)
        shot("recipes-category")
        expect("Plăcinta Anei", .any, exact: false)
        tap("Favorite", .button, exact: false, optional: true)
        shot("recipes-favorites")
        tap("Toate", .button, exact: false, optional: true)

        if tap("Vizualizare", .button, exact: false) {
            shot("recipes-view-switch")
            dumpTree("recipes-view-switch")
            for mode in ["Listă", "Revistă", "Categorii", "Grilă"] {
                // Scrolling would close the menu: look without scrolling.
                if tap("Vizualizare: \(mode)", .button, optional: true, scroll: false) || tap(mode, .button, scroll: false, pick: .highest) {
                    settle(1)
                    shot("recipes-view-\(mode)")
                    tap("Vizualizare", .button, exact: false, optional: true, scroll: false)
                }
            }
        }
        if tap("Ordine", .button, optional: true) {
            shot("recipes-sort-menu")
            tap("Cele mai rapide", .button, exact: false)
            settle(1)
            shot("recipes-sorted-fast")
        }

        // Long press: the context menu.
        let tile = el("Suc de portocale", .any, exact: false)
        if tile.waitForExistence(timeout: 3) {
            tile.press(forDuration: 1.2)
            settle(1)
            shot("recipes-context-menu")
            dumpTree("recipe-context-menu")
            dismissMenu()
        }
    }

    // MARK: Editor

    func testR07_EditorNewRecipe() {
        launch(area: "recipes", tab: "recipes")
        tap("Rețetă nouă", .button)
        settle(1)
        shot("new-ways")
        audit("new-ways")
        dumpTree("new-ways")
        expect("De unde vine rețeta?", .staticText)

        tap("Scriu eu", .any, exact: false)
        settle(1)
        shot("editor-blank")
        dumpTree("editor-blank")
        audit("editor-blank")
        unlabeledButtons("editor-blank")
        tap("Salvează rețeta", .button)
        expect("Scrie un titlu", .staticText, exact: false, "saving without a title asks for one")
        shot("editor-no-title")

        enter("Omletă QA", into: "Numele rețetei")
        if tap("Ingrediente", .button, pick: .highest) {
            shot("editor-ingredients-tab")
            dumpTree("editor-ingredients")
            let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.element(boundBy: 0)
            field.tap()
            field.typeText("3 ouă\n1 lingură unt\nsare")
            shot("editor-ingredients-typed")
        }
        if tap("Pași", .button, pick: .highest) {
            shot("editor-steps-tab")
            dumpTree("editor-steps")
            tap("Adaugă un pas", .any, exact: false)
            settle()
            dumpTree("editor-steps-one")
            let first = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
            if check(first.waitForExistence(timeout: 2), "a step field after 'Adaugă un pas'") {
                first.tap(); first.typeText("Bate ouăle 2 minute.")
            }
            hideKeyboard()
            tap("Adaugă un pas", .any, exact: false)
            settle()
            let steps = app.textViews.count > 0 ? app.textViews : app.textFields
            log("step fields after the second 'Adaugă un pas': \(steps.count)")
            let last = steps.element(boundBy: max(0, steps.count - 1))
            if last.exists { last.tap(); last.typeText("Coace 5 minute la foc mic.") }
            shot("editor-steps-typed")
        }
        app.swipeDown()
        tap("Salvează rețeta", .button)
        settle(2)
        shot("editor-saved")
        log("after save: " + screenTexts())
        expect("Omletă QA", .staticText, exact: false, "saved recipe opens")
        expect("3 ouă", .any, exact: false, "ingredients saved")
        tap("Pași", .button, optional: true)
        expect("Coace 5 minute", .any, exact: false, "second step saved")
        shot("editor-saved-steps")

        // Delete it again.
        tap("Mai multe", .button, pick: .highest)
        tap("Șterge rețeta", .button, exact: false)
        shot("delete-confirm")
        tap("Da, șterge", .button)
        settle(1.5)
        shot("after-delete")
        expectGone("Omletă QA", .any, exact: false, timeout: 3, "deleted recipe is gone")

        // Leaving with changes asks first.
        tap("Rețetă nouă", .button)
        tap("Scriu eu", .any, exact: false)
        enter("De aruncat", into: "Numele rețetei")
        goBack()
        settle()
        shot("editor-discard-alert")
        expect("Renunți la modificări?", .any, "leaving a changed draft asks first")
        tap("Renunță la modificări", .button)
        settle(1)
        expect("Rețetele mele", .staticText, "back on the list after discarding")

        // Din link sau text (no server in demo: see what it says).
        tap("Rețetă nouă", .button)
        tap("Din link sau text", .any, exact: false)
        shot("new-paste")
        dumpTree("new-paste")
        enter("https://www.example.com/reteta-de-clatite")
        tap("Importă", .button, optional: true)
        settle(3)
        shot("new-paste-import")
        log("after import: " + screenTexts())
        tap("Alte variante", .any, exact: false, optional: true)
        tap("Cu AI", .any, exact: false)
        shot("new-ai")
        dumpTree("new-ai")
        audit("new-ai")
    }
}

extension XCUIElement {
    /// Clears a text field and types new text.
    func clearAndType(_ text: String) {
        guard exists else { return }
        tap()
        if let value = value as? String, !value.isEmpty, value != placeholderValue {
            typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count + 2))
        }
        typeText(text)
    }
}
