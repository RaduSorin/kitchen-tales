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
        let shared = recipes.recipes.filter { $0.mine && $0.shared }.count + stories.allStories.filter { $0.mine && $0.shared }.count
        // Like the web: one row each for the people, inviting, the space's name and what is shared.
        ProfilePage(title: admin ? "Familie și partajare" : "Partajare") {
            Section {
                if admin {
                    NavigationLink(value: ProfileRoute.people) { row("person.2", "Persoane", value: "\(profile.members.count)") }
                    Button { inviting = true } label: { row("envelope", "Invită pe cineva", value: nil) }
                        .buttonStyle(.plain)
                }
                Button {
                    spaceName = profile.settings.spaceName ?? ""
                    renaming = true
                } label: { row("house", "Numele spațiului", value: profile.settings.spaceName ?? "", chevron: true) }
                    .buttonStyle(.plain)
                NavigationLink(value: ProfileRoute.sharing) { row("square.and.arrow.up", "Ce partajez", value: shared == 0 ? "nimic" : "\(shared)") }
            } footer: {
                Text("Ce partajezi apare la ceilalți ca „De la \(profile.settings.spaceName ?? auth.account?.displayName ?? "")”.")
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

    private func row(_ symbol: String, _ title: String, value: String?, chevron: Bool = false) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Theme.accent.opacity(0.12)))
                .overlay(Circle().strokeBorder(Theme.accent.opacity(0.3)))
            Text(title).font(.ktBody).foregroundStyle(Theme.text)
            Spacer()
            if let value { Text(value).font(.ktBody).foregroundStyle(Theme.muted) }
            if chevron { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted.opacity(0.6)) }
        }
        .contentShape(Rectangle())
    }
}

/// "Persoane", like the web: who is in our space, who has a separate account, resending an
/// invitation that was not used yet, and "Invită pe cineva".
struct PeopleView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(ProfileStore.self) private var profile
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.profileNight) private var night
    @State private var inviting = false

    var body: some View {
        let me = auth.account?.email?.lowercased()
        ProfilePage(title: "Persoane") {
            group("Spațiul tău", profile.members.filter { $0.sameSpace || $0.email.lowercased() == me }, me: me,
                  hint: "Cei din spațiul tău văd și modifică toate rețetele, poveștile, săptămâna și lista de cumpărături.")
            group("Conturi separate", profile.members.filter { !$0.sameSpace && $0.email.lowercased() != me }, me: me,
                  hint: "Au rețetele și poveștile lor și văd doar ce partajezi tu.")
            Section {
                Button("Invită pe cineva") { inviting = true }
                    .buttonStyle(.ktPrimaryWide)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        }
        .sheet(isPresented: $inviting) { InviteSheet() }
    }

    @ViewBuilder private func group(_ title: String, _ people: [FamilyMember], me: String?, hint: String) -> some View {
        if !people.isEmpty {
            Section {
                ForEach(people) { m in
                    HStack(spacing: 12) {
                        Text(String(m.email.prefix(1)).uppercased())
                            .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .body))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(LinearGradient(colors: [Color(hex: 0xE7A26B), Color(hex: 0xC4664A)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.email).font(.ktBody).foregroundStyle(Theme.text).lineLimit(1).truncationMode(.middle)
                            Text(note(m, me: me)).font(.ktFootnote).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if m.pending && m.email.lowercased() != me {
                            Button("Retrimite") { resend(m) }
                                .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                                .foregroundStyle(Theme.text)
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(Capsule().fill(.white.opacity(0.1)))
                                .buttonStyle(.plain)
                        }
                    }
                }
            } header: {
                Text(title.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
            } footer: {
                Text(hint)
            }
            .profileRows(night)
        }
    }

    private func note(_ m: FamilyMember, me: String?) -> String {
        if m.email.lowercased() == me { return "Tu · administrator" }
        if m.pending { return "Invitat, încă nu s-a conectat" }
        return m.sameSpace ? "Vede și modifică tot" : "Vede doar ce partajezi"
    }

    private func resend(_ member: FamilyMember) {
        Task {
            do {
                try await profile.resendInvite(member)
                kitchen.say("Am retrimis invitația la \(member.email).")
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
