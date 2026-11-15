import Foundation
import SwiftUI
import Testing
@testable import KitchenTales

/// "Urmează": the rules of the story queue (no story twice, play next moves up, the child's limit).
struct UpNextTests {
    @Test func addGoesToTheEndOnce() {
        var q = UpNext()
        let first = q.add("a")
        let second = q.add("b")
        let again = q.add("a")
        #expect(first && second && !again)
        #expect(q.ids == ["a", "b"])
        #expect(q.place(of: "b") == 2)
        #expect(q.place(of: "x") == nil)
    }

    @Test func playNextMovesToTheFront() {
        var q = UpNext()
        q.add("a"); q.add("b"); q.add("c")
        q.playNext("c")
        #expect(q.ids == ["c", "a", "b"])
        q.playNext("d")
        #expect(q.ids == ["d", "c", "a", "b"])
    }

    @Test func playNextKeepsWhoChoseIt() {
        var q = UpNext()
        q.add("a", byKid: true)
        q.playNext("a")
        #expect(q.items.first == QueuedStory(id: "a", byKid: true))
    }

    @Test func theChildHasALimit() {
        var q = UpNext()
        q.add("p")
        for i in 0..<UpNext.kidLimit {
            let added = q.add("k\(i)", byKid: true)
            #expect(added)
        }
        #expect(!q.kidHasRoom)
        let oneMore = q.add("one-more", byKid: true)
        #expect(!oneMore)
        // The parent can still add.
        let parent = q.add("parent")
        #expect(parent)
        #expect(q.kidCount == UpNext.kidLimit)
    }

    @Test(arguments: [
        // offsets, destination, expected (like SwiftUI's onMove)
        ([0], 3, ["b", "c", "a", "d"]),
        ([3], 0, ["d", "a", "b", "c"]),
        ([1], 2, ["a", "b", "c", "d"]),
        ([0, 2], 4, ["b", "d", "a", "c"]),
        ([2], 1, ["a", "c", "b", "d"]),
    ])
    func moveLikeOnMove(offsets: [Int], destination: Int, expected: [String]) {
        var q = UpNext()
        for id in ["a", "b", "c", "d"] { q.add(id) }
        q.move(from: IndexSet(offsets), to: destination)
        #expect(q.ids == expected)
        var plain = ["a", "b", "c", "d"]
        plain.move(fromOffsets: IndexSet(offsets), toOffset: destination)
        #expect(plain == expected)
    }

    @Test func removeClearAndForget() {
        var q = UpNext()
        q.add("a"); q.add("b"); q.add("c")
        q.remove("b")
        #expect(q.ids == ["a", "c"])
        q.keep(only: ["c", "z"])
        #expect(q.ids == ["c"])
        q.clear()
        #expect(q.isEmpty)
    }

    @Test func savedOnThePhone() throws {
        let defaults = try #require(UserDefaults(suiteName: "up-next-tests"))
        defaults.removePersistentDomain(forName: "up-next-tests")
        var q = UpNext()
        q.add("a"); q.add("b", byKid: true)
        q.save(defaults)
        #expect(UpNext.saved(defaults) == q)
        defaults.removePersistentDomain(forName: "up-next-tests")
        #expect(UpNext.saved(defaults).isEmpty)
    }

    @Test(arguments: [
        // stopAfter, played, stories still to come before the moon
        (1, 0, 0), (3, 0, 2), (3, 1, 1), (3, 2, 0), (5, 0, 4), (2, 5, 0),
    ])
    func moonLine(stopAfter: Int, played: Int, expected: Int) {
        #expect(UpNext.untilStop(stopAfter: stopAfter, played: played) == expected)
    }

    @Test func messages() {
        #expect(StoryPlayer.message(.first, playing: true) == "Urmează după povestea asta")
        #expect(StoryPlayer.message(.added, playing: false) == "Adăugată la coadă. O găsești pe Acasă.")
        #expect(StoryPlayer.message(.alreadyThere, playing: true) == "E deja în coadă")
        #expect(StoryPlayer.message(.kidFull, playing: true) == "Ai ales deja 3 povești")
    }
}
