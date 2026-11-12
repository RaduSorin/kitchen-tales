import SwiftUI

extension AppCommands {
    /// kitchentales://recipe/<id> (the Share card's "Deschide rețeta").
    nonisolated static func command(for url: URL) -> Command? {
        guard url.scheme == "kitchentales" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch url.host {
        case "recipe": return parts.first.map { .openRecipe($0) }
        case "list": return .openList
        case "week": return .openWeek
        case "story": return .playStory(parts.first)
        default: return nil
        }
    }
}

/// Screenshots of the Share card (`-screen share-working|share-saved|share-days|share-not-recipe`),
/// drawn over a recipe photo the way it shows over TikTok.
struct ShareCardDemo: View {
    @State private var model: ShareCardModel

    init(screen: String) { _model = State(initialValue: Self.make(screen)) }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let photo = DemoPhotos.image("cartofi") {
                Image(uiImage: photo).resizable().scaledToFill().ignoresSafeArea()
            }
            ShareCardView(model: model, onClose: {}, onOpenRecipe: { _ in })
        }
    }

    private static func make(_ screen: String) -> ShareCardModel {
        let url = URL(string: "https://www.tiktok.com/@bucatariaanei/video/1")!
        let recipe = SharedRecipe(id: "r1", title: "Cartofi crocanți la cuptor", category: "Garnituri", minutes: 45, servings: 4, ingredientCount: 7)
        let phase: ShareCardModel.Phase = switch screen {
        case "share-saved", "share-days": .saved(recipe)
        case "share-not-recipe": .notRecipe
        default: .working(step: 1)
        }
        let model = ShareCardModel(demo: phase, input: .link(url), title: screen == "share-not-recipe" ? "Dans nou 💃" : "Cartofi crocanți la cuptor",
                                   thumbnail: screen == "share-not-recipe" ? nil : DemoPhotos.image("cartofi"))
        model.picksDay = screen == "share-days"
        return model
    }
}
