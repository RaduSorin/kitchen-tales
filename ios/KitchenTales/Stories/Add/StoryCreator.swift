import AVFoundation
import Foundation
import UIKit
import UniformTypeIdentifiers
import UserNotifications

/// The server side of adding a story, like `uploadFile`, `createStory` and `generateStory` in
/// src/lib/db.ts: a signed upload link per file, the Story row in our space, and the AI story job.
@MainActor
struct StoryCreator {
    let client: GraphQLClient
    let space: String
    let spaceName: String

    // MARK: Files

    /// Uploads a file into our space folder and returns its path (e.g. "stories/space-x/….m4a").
    func upload(_ file: URL, prefix: String) async throws -> String {
        let ext = file.pathExtension.isEmpty ? "m4a" : file.pathExtension.lowercased()
        let type = UTType(filenameExtension: ext)?.preferredMIMEType
        let query = "mutation Up($prefix: String!, $ext: String!, $contentType: String) { uploadUrl(prefix: $prefix, ext: $ext, contentType: $contentType) { path url } }"
        var variables: [String: Any] = ["prefix": prefix, "ext": ext]
        if let type { variables["contentType"] = type }
        let body = try await client.run(query, variables: variables)
        guard let target = body["uploadUrl"] as? [String: Any], let path = target["path"] as? String,
              let raw = target["url"] as? String, let url = URL(string: raw) else {
            throw BackendError.server("Nu am putut încărca fișierul.")
        }
        var request = URLRequest(url: url, timeoutInterval: 300)
        request.httpMethod = "PUT"
        if let type { request.setValue(type, forHTTPHeaderField: "Content-Type") }
        let response: URLResponse
        do {
            (_, response) = try await URLSession.shared.upload(for: request, fromFile: file)
        } catch let error as URLError where CognitoClient.isOffline(error) {
            throw BackendError.offline
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BackendError.server("Încărcarea a eșuat (\(http.statusCode)).")
        }
        return path
    }

    func deleteFile(_ path: String) async {
        _ = try? await client.run("mutation Del($paths: [String]!) { deleteFiles(paths: $paths) }", variables: ["paths": [path]])
    }

    // MARK: The story row

    struct NewStory {
        var title: String
        var emoji: String
        var scene: Int?
        var coverKey: String?
        var collection: String?
        var source: Story.Source
        var audioKey: String
        var durationSec: Double?
        var text: String?
        var shared: Bool
    }

    /// Saves the Story row in our space; returns the new story as the library shows it.
    func create(_ new: NewStory) async throws -> Story {
        var input: [String: Any] = [
            "title": new.title, "emoji": new.emoji, "source": new.source.rawValue, "audioKey": new.audioKey,
            "spaceGroups": [space], "readerGroups": new.shared ? ["everyone"] : [String](),
            "sharedDirect": new.shared, "spaceName": spaceName,
        ]
        if let scene = new.scene { input["scene"] = scene }
        if let coverKey = new.coverKey { input["coverKey"] = coverKey }
        if let collection = new.collection { input["collection"] = collection }
        if let seconds = new.durationSec { input["durationSec"] = seconds.rounded() }
        if let text = new.text { input["text"] = text }
        let query = "mutation New($input: CreateStoryInput!) { createStory(input: $input) { \(Story.fields) } }"
        let body = try await client.run(query, variables: ["input": input])
        guard let row = body["createStory"] as? [String: Any], let story = Story(row: row, mySpace: space) else {
            throw BackendError.server("Povestea nu s-a salvat. Încearcă din nou.")
        }
        return story
    }

    // MARK: A story written and read by the app

    struct Brief: Codable, Equatable {
        var childName = ""
        var gender: String?
        var age: Int?
        var topics: [String] = []
        var prompt = ""
        var length = "medium"
    }

    struct Generated {
        let text: String
        let audioKey: String
        let note: String?
    }

    /// Starts the story job and waits for its outcome file (up to 3.5 minutes, like the web).
    func generate(title: String, brief: Brief?, ownText: String?, voice: String?) async throws -> Generated {
        // Writing and reading a story takes minutes: ask iOS for time when the app goes to the
        // background, and say so with a notification when it is ready.
        let work = UIApplication.shared.beginBackgroundTask(withName: "story") {}
        defer { UIApplication.shared.endBackgroundTask(work) }
        if LaunchOptions.demoAccount == nil {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        }
        let generated = try await runGenerate(title: title, brief: brief, ownText: ownText, voice: voice)
        NotificationRouter.storyReady(title: title)
        return generated
    }

    private func runGenerate(title: String, brief: Brief?, ownText: String?, voice: String?) async throws -> Generated {
        let jobId = UUID().uuidString.lowercased()
        var variables: [String: Any] = ["jobId": jobId, "title": title]
        if let voice, !voice.isEmpty { variables["voice"] = voice }
        if let ownText {
            variables["text"] = ownText
        } else if let brief {
            let prompt = (brief.topics + [brief.prompt.trimmingCharacters(in: .whitespaces)])
                .filter { !$0.isEmpty }.joined(separator: ", ")
            if !prompt.isEmpty { variables["prompt"] = prompt }
            let name = brief.childName.trimmingCharacters(in: .whitespaces)
            if !name.isEmpty { variables["childName"] = name }
            if let gender = brief.gender { variables["gender"] = gender }
            if let age = brief.age { variables["age"] = age }
            variables["length"] = brief.length
        }
        let query = """
        mutation Gen($jobId: String!, $title: String!, $prompt: String, $childName: String, $gender: String, $age: Int, $length: String, $text: String, $voice: String) {
          startGenerateStory(jobId: $jobId, title: $title, prompt: $prompt, childName: $childName, gender: $gender, age: $age, length: $length, text: $text, voice: $voice) { success }
        }
        """
        _ = try await client.run(query, variables: variables)
        let path = "ai-jobs/\(space)/\(jobId).json"
        let links = FileLinks(client: client)
        let until = Date().addingTimeInterval(210)
        var wait: Double = 1.5
        while Date() < until {
            try await Task.sleep(for: .seconds(wait))
            wait = min(wait + 0.5, 4)
            guard let url = await links.url(for: path, ref: nil) else { continue }
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let outcome = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            await deleteFile(path)
            guard outcome["ok"] as? Bool == true else {
                throw BackendError.server((outcome["error"] as? String) ?? "Nu am putut crea povestea.")
            }
            let result = outcome["data"] as? [String: Any]
            guard let audioKey = result?["audioKey"] as? String, let text = result?["text"] as? String else {
                throw BackendError.server("Nu am putut crea povestea.")
            }
            return Generated(text: text, audioKey: audioKey, note: result?["note"] as? String)
        }
        throw BackendError.server("Durează mai mult decât de obicei. Verifică internetul și încearcă din nou.")
    }

    // MARK: Family settings (narrator voice, the child)

    struct Family {
        var narratorId = ""
        var narratorName = ""
        var childName = ""
        var childGender: String?
        var childBirthYear: Int?
    }

    func family() async -> Family {
        let fields = "narrator narratorName childName childGender childBirthYear"
        guard let rows = try? await client.listAll("listFamilySettings", fields: fields), let row = rows.first else { return Family() }
        return Family(narratorId: row["narrator"] as? String ?? "", narratorName: row["narratorName"] as? String ?? "",
                      childName: row["childName"] as? String ?? "", childGender: row["childGender"] as? String,
                      childBirthYear: row["childBirthYear"] as? Int)
    }
}

/// How long an audio file plays, read from the file (nil when it can't tell).
func audioSeconds(_ url: URL) async -> Double? {
    let asset = AVURLAsset(url: url)
    guard let duration = try? await asset.load(.duration) else { return nil }
    let seconds = duration.seconds
    return seconds.isFinite && seconds > 0 ? seconds : nil
}
