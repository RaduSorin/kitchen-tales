import SwiftUI

/// "Familie și partajare": the people who can sign in (only admins see them and invite), the
/// space's name and what this space shares with every account.
struct FamilyView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(ProfileStore.self) private var profile
    @Environment(RecipeStore.self) private var recipes
    @Environment(StoryStore.self) private var stories
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.profileNight) private var night
    @State private var inviting = LaunchOptions.screen == "profile-invite"
    @State private var renaming = false
    @State private var spaceName = ""

    var body: some View {
        let admin = auth.account?.isAdmin ?? false
        let me = auth.account?.email?.lowercased()
        ProfilePage(title: "Familie și partajare") {
            if admin {
                Section {
                    ForEach(profile.members) { member in
                        HStack(spacing: 12) {
                            Text(String(member.name.prefix(1)))
                                .font(.custom(AppFont.display, size: 16, relativeTo: .body))
                                .foregroundStyle(member.sameSpace ? Theme.onAccent : Theme.text)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(member.sameSpace
                                    ? AnyShapeStyle(LinearGradient(colors: [Theme.accent, Color(hex: 0xBE7A3E)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                    : AnyShapeStyle(LinearGradient(colors: [Color(hex: 0x8A6BB0), Color(hex: 0x5B4A7A)], startPoint: .topLeading, endPoint: .bottomTrailing))))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name).font(.ktBody).foregroundStyle(Theme.text)
                                Text(detail(member, me: me)).font(.ktFootnote).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                        }
                        .swipeActions {
                            if member.pending {
                                Button("Retrimite") { resend(member) }.tint(Theme.accent)
                            }
                        }
                    }
                    Button { inviting = true } label: {
                        Label("Invită pe cineva", systemImage: "plus").font(.ktBody).foregroundStyle(Theme.accent)
                    }
                } header: {
                    header("Persoane · \(profile.members.count)")
                } footer: {
                    Text("Cine e în spațiul vostru vede tot. Ceilalți văd doar ce partajezi.")
                }
                .profileRows(night)
            }
            Section {
                Button {
                    spaceName = profile.settings.spaceName ?? ""
                    renaming = true
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Numele spațiului").font(.ktBody).foregroundStyle(Theme.text)
                            Text("ceilalți văd „De la \(profile.settings.spaceName ?? auth.account?.displayName ?? "")”")
                                .font(.ktFootnote).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Text(profile.settings.spaceName ?? "").font(.ktBody).foregroundStyle(Theme.muted)
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted.opacity(0.6))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                NavigationLink(value: ProfileRoute.sharing) {
                    LabeledContent("Ce partajez") {
                        let count = recipes.recipes.filter { $0.mine && $0.shared }.count + stories.allStories.filter { $0.mine && $0.shared }.count
                        Text(count == 0 ? "nimic" : "\(count)")
                    }
                    .font(.ktBody)
                }
            } header: {
                header("Spațiul tău")
            }
            .profileRows(night)
        }
        .sheet(isPresented: $inviting) { InviteSheet() }
        .alert("Numele spațiului", isPresented: $renaming) {
            TextField("Sorin", text: $spaceName)
            Button("Renunță", role: .cancel) {}
            Button("Salvează") {
                let name = spaceName
                Task { await profile.renameSpace(name, recipes: recipes, stories: stories) }
            }
        } message: {
            Text("Ce partajezi apare la ceilalți ca „De la …”.")
        }
    }

    private func detail(_ member: FamilyMember, me: String?) -> String {
        if member.email.lowercased() == me { return "tu · administrator" }
        let base = member.sameSpace ? "același spațiu · vede tot" : "alt spațiu · vede ce partajezi"
        return member.pending ? "\(base) · n-a intrat încă" : base
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }

    private func resend(_ member: FamilyMember) {
        Task {
            do {
                try await profile.resendInvite(member)
                kitchen.say("Am retrimis invitația")
            } catch {
                kitchen.say(error.localizedDescription)
            }
        }
    }
}

/// E-mail and what the person sees; the server creates the account and emails a password.
private struct InviteSheet: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var separate = true
    @State private var sending = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("E-mailul persoanei", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused)
                } footer: {
                    if let error { Text(error).foregroundStyle(Theme.danger) }
                }
                .listRowBackground(Theme.surface)
                Section {
                    choice("Doar ce partajez", "un prieten, bunica", on: separate) { separate = true }
                    choice("Tot, în spațiul nostru", "partenerul de viață", on: !separate) { separate = false }
                } header: {
                    Text("CE VEDE").font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
                } footer: {
                    Text("Primește un e-mail cu parola de început, apoi poate intra din aplicație.")
                }
                .listRowBackground(Theme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Invită pe cineva")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if sending { ProgressView() } else {
                        Button("Trimite") { send() }.fontWeight(.bold).disabled(!email.contains("@"))
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { focused = LaunchOptions.screen != "profile-invite" }
    }

    private func choice(_ title: String, _ detail: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: { action(); Haptics.select() }) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.ktBody).foregroundStyle(Theme.text)
                    Text(detail).font(.ktFootnote).foregroundStyle(Theme.muted)
                }
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func send() {
        sending = true
        error = nil
        Task {
            do {
                try await profile.invite(email, separate: separate)
                Haptics.success()
                kitchen.say("Am trimis invitația")
                dismiss()
            } catch {
                self.error = error.localizedDescription
                Haptics.warning()
            }
            sending = false
        }
    }
}

/// "Ce partajez": every story and recipe of ours, each with its switch (on = every account sees it).
struct SharingView: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(RecipeStore.self) private var recipes
    @Environment(StoryStore.self) private var stories
    @Environment(\.profileNight) private var night

    var body: some View {
        let myStories = stories.allStories.filter(\.mine)
        let myRecipes = recipes.recipes.filter(\.mine)
        let name = profile.settings.spaceName
        ProfilePage(title: "Ce partajez") {
            Section {
                ForEach(myStories) { story in
                    Toggle(isOn: Binding(get: { story.shared }, set: { on in Task { _ = await stories.setShared(story.id, on, spaceName: name) } })) {
                        Text("\(story.emoji)  \(story.title)").font(.ktBody).lineLimit(1)
                    }
                }
                if myStories.isEmpty { Text("Nicio poveste încă.").foregroundStyle(Theme.muted) }
            } header: {
                header("Povești · \(myStories.filter(\.shared).count) din \(myStories.count) partajate")
            }
            .profileRows(night)
            Section {
                ForEach(myRecipes) { recipe in
                    Toggle(isOn: Binding(get: { recipe.shared }, set: { on in Task { _ = await recipes.setShared(recipe.id, on, spaceName: name) } })) {
                        Text(recipe.title).font(.ktBody).lineLimit(1)
                    }
                }
                if myRecipes.isEmpty { Text("Nicio rețetă încă.").foregroundStyle(Theme.muted) }
            } header: {
                header("Rețete · \(myRecipes.filter(\.shared).count) din \(myRecipes.count) partajate")
            } footer: {
                Text("Ce partajezi văd toate conturile invitate. Cei din spațiul vostru văd oricum tot.")
            }
            .profileRows(night)
        }
        .tint(Theme.accent)
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }
}
