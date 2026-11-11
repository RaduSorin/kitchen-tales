import Foundation
import Testing
@testable import KitchenTales

@MainActor
struct ManageTests {
    @Test func checksFolderNames() {
        let taken = ["Povești de seară", "Cântece"]
        #expect(StoryLibrary.folderNameProblem("   ", taken: taken) == "Scrie un nume pentru folder.")
        #expect(StoryLibrary.folderNameProblem(String(repeating: "a", count: 41), taken: taken) == "Numele e prea lung (cel mult 40 de litere).")
        #expect(StoryLibrary.folderNameProblem("cantece", taken: taken) == "Există deja un folder cu acest nume.")
        #expect(StoryLibrary.folderNameProblem("Vocea noastră", taken: taken) == "Există deja un folder cu acest nume.")
        #expect(StoryLibrary.folderNameProblem("Cântece", taken: taken, current: "Cântece") == nil)
        #expect(StoryLibrary.folderNameProblem("Animale", taken: taken) == nil)
    }

    @Test func folderSharingFollowsItsStories() {
        let a = Story(id: "a", title: "A", emoji: "🐻", collection: "X", shared: true)
        let b = Story(id: "b", title: "B", emoji: "🐭", collection: "X", shared: false)
        let mixed = StoryFolder(name: "X", items: [a, b], icon: nil, builtin: false, mine: true)
        #expect(mixed.sharedCount == 1)
        #expect(!mixed.shared)
        #expect(FolderView.shareText(mixed).hasPrefix("1 din 2 povești sunt partajate cu toate conturile, una e doar în spațiul nostru."))
        let all = StoryFolder(name: "X", items: [a], icon: nil, builtin: false, mine: true)
        #expect(all.shared)
        #expect(FolderView.shareText(all).hasPrefix("Toate cele o poveste sunt partajate"))
        let empty = StoryFolder(name: "Y", items: [], icon: nil, builtin: false, mine: true, rowId: "f", rowShared: true)
        #expect(empty.shared)
    }

    @Test func groupsFolderRows() {
        let rows = [StoryFolderRow(id: "f2", name: "Cântece", icon: "🎵", mine: true, shared: false, spaceName: nil)]
        let folders = StoryLibrary.groupFolders([Story(id: "s", title: "S", emoji: "⭐", collection: "Cântece", shared: false)], rows: rows)
        #expect(folders.first?.rowId == "f2")
        #expect(folders.first?.icon == "🎵")
        #expect(folders.first?.shared == false)
    }
}
