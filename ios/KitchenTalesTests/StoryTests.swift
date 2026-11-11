import Foundation
import Testing
@testable import KitchenTales

struct StoryTests {
    /// The same titles get the same drawn scene as on the web (values from src/lib/stories.ts).
    @Test(arguments: [
        ("Aladdin", 3), ("Regele Leu", 6), ("În căutarea lui Nemo", 3), ("Ursulețul și luna 🐻", 1),
        ("O poveste foarte foarte lungă despre un dragon care strănuta mereu", 4),
    ])
    func sceneMatchesTheWeb(title: String, index: Int) {
        #expect(CoverScene.index(title) == index)
    }

    @Test func chosenSceneWins() {
        #expect(CoverScene.of(title: "Aladdin", scene: 5) == CoverScene.all[5])
        #expect(CoverScene.of(title: "Aladdin", scene: 42) == CoverScene.all[3])
    }

    @Test func folderTimeLikeTheWeb() {
        func items(_ minutes: [Double]) -> [Story] {
            minutes.enumerated().map { Story(id: "\($0.offset)", title: "x", emoji: "⭐", durationSec: $0.element * 60) }
        }
        #expect(StoryLibrary.folderTime([]) == "")
        #expect(StoryLibrary.folderTime(items([20, 25])) == "45 min")
        #expect(StoryLibrary.folderTime(items([60, 60])) == "2 h")
        #expect(StoryLibrary.folderTime(items([45, 45])) == "1 h 30")
        #expect(StoryLibrary.folderTime(items([600, 15])) == "10 h")
    }

    @Test func foldersInShelfOrder() {
        let stories = [
            Story(id: "1", title: "A", emoji: "⭐", source: .recording),
            Story(id: "2", title: "B", emoji: "⭐", collection: "Povești Disney"),
            Story(id: "3", title: "C", emoji: "⭐", source: .generated),
            Story(id: "4", title: "D", emoji: "⭐", collection: "Animale"),
            Story(id: "5", title: "E", emoji: "⭐", collection: "Basme", mine: false, spaceName: "Ana"),
            Story(id: "6", title: "F", emoji: "⭐", collection: "Povești Disney"),
        ]
        let folders = StoryLibrary.groupFolders(stories)
        #expect(folders.map(\.name) == ["Animale", "Povești Disney", "Povești create de noi", "Vocea noastră", "Basme · Ana"])
        #expect(folders[1].items.map(\.id) == ["2", "6"])
        #expect(folders[2].builtin)
        #expect(!folders[4].mine)
    }

    @Test func emptyFolderRowsStillShow() {
        let row = StoryFolderRow(row: ["id": "f1", "name": "Muzică", "icon": "🎵", "spaceGroups": ["space-casa"]], mySpace: "space-casa")
        let folders = StoryLibrary.groupFolders([], rows: [try! #require(row)])
        #expect(folders.count == 1)
        #expect(folders[0].icon == "🎵")
        #expect(folders[0].subtitle == "0 povești")
    }

    @Test func receivedNames() {
        #expect(StoryLibrary.receivedFolderName(nil, "Ana") == "Primite de la Ana")
        #expect(StoryLibrary.receivedFolderName("Basme", nil) == "Basme · alt cont")
    }

    @Test func storyFromServerRow() throws {
        let row: [String: Any] = [
            "id": "s1", "title": "Luna", "audioKey": "stories/space-casa/s1.mp3", "durationSec": NSNumber(value: 312.5),
            "scene": NSNumber(value: 2), "coverKey": "", "collection": NSNull(), "source": "generated",
            "spaceGroups": ["space-casa"], "readerGroups": ["everyone"], "favorite": true,
        ]
        let story = try #require(Story(row: row, mySpace: "space-casa"))
        #expect(story.emoji == "⭐")
        #expect(story.scene == 2)
        #expect(story.coverKey == nil)
        #expect(story.collection == nil)
        #expect(story.source == .generated)
        #expect(story.mine && story.shared && story.favorite)
        #expect(story.durationSec == 312.5)
        #expect(story.minutesLabel == "5 min")
        #expect(StoryLibrary.folderOf(story) == "Povești create de noi")

        // Another space's story: its spaceGroups come back hidden (null).
        var other = row
        other["spaceGroups"] = NSNull()
        other["spaceName"] = "Ana"
        let theirs = try #require(Story(row: other, mySpace: "space-casa"))
        #expect(!theirs.mine)
        #expect(StoryLibrary.folderOf(theirs) == "Primite de la Ana")
        #expect(Story(row: ["id": "x"], mySpace: nil) == nil)
    }

    @Test func searchIgnoresDiacriticsAndCase() {
        #expect(StoryStore.fold("  Ursulețul ȘI Luna ") == "ursuletul si luna")
    }

    @Test func sleepFadeLowersTheVolumeAtTheEnd() {
        #expect(StoryPlayer.fadeVolume(secondsLeft: 120) == 1)
        #expect(StoryPlayer.fadeVolume(secondsLeft: 30) == 1)
        #expect(abs(StoryPlayer.fadeVolume(secondsLeft: 15) - 0.25) < 0.0001)
        #expect(StoryPlayer.fadeVolume(secondsLeft: 0) == 0)
        #expect(StoryPlayer.fadeVolume(secondsLeft: -3) == 0)
    }

    @Test func clockTimes() {
        #expect(clockTime(0) == "0:00")
        #expect(clockTime(184.7) == "3:04")
        #expect(clockTime(.nan) == "0:00")
    }

    @Test func backendConfigParses() throws {
        let data = Data(#"{"auth":{},"data":{"url":"https://example.appsync-api.eu-central-1.amazonaws.com/graphql"}}"#.utf8)
        let config = try #require(BackendConfig.parse(data))
        #expect(config.graphqlURL.host() == "example.appsync-api.eu-central-1.amazonaws.com")
        #expect(BackendConfig.parse(Data(#"{"auth":{}}"#.utf8)) == nil)
        #expect(BackendConfig.fromBundle() != nil)
    }
}
