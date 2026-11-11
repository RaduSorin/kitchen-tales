import PhotosUI
import SwiftUI
import UIKit

/// The round ‹ at the top of the editor pages (a dark glass circle, like "Poveste nouă").
struct EditorBackButton: View {
    var label = "Renunță"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.12)))
                .environment(\.colorScheme, .dark)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The big gold button of the editor pages ("Completează rețeta", "Salvează rețeta"); dimmed
/// while it can't be used, like the web's disabled `btn primary big`.
struct EditorBigButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Body(configuration: configuration) }

    private struct Body: View {
        let configuration: Configuration
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            configuration.label
                .font(.custom(AppFont.bodyBold, size: 17, relativeTo: .body))
                .foregroundStyle(enabled ? Theme.onAccent : Theme.accent.opacity(0.55))
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(Capsule().fill(enabled ? (configuration.isPressed ? Theme.accentHi : Theme.accent) : Theme.accent.opacity(0.16)))
                .overlay(Capsule().strokeBorder(Theme.accent.opacity(enabled ? 0 : 0.18)))
                .shadow(color: Theme.accent.opacity(enabled ? 0.28 : 0), radius: 16, y: 4)
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
                .animation(.snappy(duration: 0.15), value: configuration.isPressed)
                .contentShape(Capsule())
        }
    }
}

/// The "−  4  +" stepper of the AI options and of Detalii.
struct EditorStepper: View {
    let value: Int?
    var min = 1
    var max = 99
    let change: (Int) -> Void

    var body: some View {
        HStack(spacing: 0) {
            stepButton("minus", "Mai puține", enabled: (value ?? 0) > min) { change(Swift.max(min, (value ?? min) - 1)) }
            Text(value.map(String.init) ?? "–")
                .font(.custom(AppFont.bodySemibold, size: 17, relativeTo: .body)).monospacedDigit()
                .foregroundStyle(Theme.text)
                .frame(minWidth: 34)
            stepButton("plus", "Mai multe", enabled: (value ?? 0) < max) { change(Swift.min(max, (value ?? 0) + 1)) }
        }
        .background(Capsule().fill(Theme.surface2))
    }

    private func stepButton(_ symbol: String, _ label: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button { Haptics.select(); action() } label: {
            Image(systemName: symbol).font(.system(size: 14, weight: .bold))
                .foregroundStyle(enabled ? Theme.text : Theme.muted.opacity(0.5))
                .frame(width: 44, height: 40)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// A small gold uppercase label ("REȚETĂ NOUĂ", "EDITEAZĂ").
struct EditorEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "ro")))
            .font(.system(.caption, weight: .bold)).tracking(1.4)
            .foregroundStyle(Theme.accent)
    }
}

extension View {
    /// Asks "Fă o poză" or "Alege din poze", then opens the camera or the photo library.
    func recipePhotoSource(isPresented: Binding<Bool>, title: String, max: Int = 1, onPick: @escaping ([UIImage]) -> Void) -> some View {
        modifier(PhotoSource(asking: isPresented, title: title, max: max, onPick: onPick))
    }
}

private struct PhotoSource: ViewModifier {
    @Binding var asking: Bool
    let title: String
    let max: Int
    let onPick: ([UIImage]) -> Void
    @State private var camera = false
    @State private var library = false
    @State private var items: [PhotosPickerItem] = []

    func body(content: Content) -> some View {
        content
            .confirmationDialog(title, isPresented: $asking, titleVisibility: .visible) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Fă o poză") { camera = true }
                }
                Button(max > 1 ? "Alege din poze" : "Alege o poză") { library = true }
                Button("Renunță", role: .cancel) {}
            }
            .photosPicker(isPresented: $library, selection: $items, maxSelectionCount: max, matching: .images)
            .onChange(of: items) {
                let picked = items
                items = []
                guard !picked.isEmpty else { return }
                Task {
                    var images: [UIImage] = []
                    for item in picked {
                        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { images.append(image) }
                    }
                    onPick(images)
                }
            }
            .fullScreenCover(isPresented: $camera) {
                CameraPicker { image in onPick([image]) }
                    .ignoresSafeArea()
            }
    }
}

/// The iPhone camera, for one photo.
struct CameraPicker: UIViewControllerRepresentable {
    let onPhoto: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onPhoto(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// A photo saved in the cloud (a step's, or one the AI drew), loaded through the files Lambda.
struct StoredPhoto: View {
    let key: String
    @Environment(RecipeStore.self) private var store
    @State private var image: UIImage?

    var body: some View {
        Color.clear
            .overlay {
                if let image { Image(uiImage: image).resizable().scaledToFill() } else { Theme.surface2 }
            }
            .clipped()
            .task(id: key) {
                if let hit = CoverImages.shared.image(key) { image = hit; return }
                guard let links = store.links, let url = await links.url(for: key, ref: nil),
                      let (data, _) = try? await URLSession.shared.data(from: url), let picture = UIImage(data: data) else { return }
                CoverImages.shared.keep(picture, key)
                image = picture
            }
    }
}
