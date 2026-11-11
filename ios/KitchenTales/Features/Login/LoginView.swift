import SwiftUI

/// Login concept A "Foaia de jos": the app icon in a gold glow under a few stars, and a dark
/// sheet rising from the bottom with the form. The same sheet walks through the first sign-in
/// with an invitation's temporary password and through "Ai uitat parola?".
struct LoginView: View {
    enum Mode: Equatable {
        case signIn
        case newPassword(session: String, username: String)
        case forgot
        case confirmCode
    }

    enum Field: Hashable { case email, password, newPassword, code }

    @Environment(AuthModel.self) private var auth
    @State private var mode: Mode = LoginView.initialMode
    @State private var email = ""
    @State private var password = ""
    @State private var newPassword = ""
    @State private var code = ""
    @State private var error: String?
    @State private var notice: String?
    @State private var busy = false
    @FocusState private var focus: Field?

    var body: some View {
        ZStack(alignment: .bottom) {
            LoginScene(compact: focus != nil || mode != .signIn, greeting: greeting)
            sheet
        }
        .animation(.spring(duration: 0.4, bounce: 0.15), value: mode)
        .animation(.easeInOut(duration: 0.25), value: focus)
    }

    private var greeting: String? {
        switch mode {
        case .newPassword: "Bun venit"
        default: nil
        }
    }

    // MARK: Sheet

    private var sheet: some View {
        VStack(spacing: 12) {
            Capsule().fill(.white.opacity(0.25)).frame(width: 38, height: 5).padding(.bottom, 6)
            switch mode {
            case .signIn: signInForm
            case .newPassword(let session, let username): newPasswordForm(session: session, username: username)
            case .forgot: forgotForm
            case .confirmCode: codeForm
            }
            if let error {
                Text(error).font(.ktFootnote).foregroundStyle(Theme.danger).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).transition(.opacity)
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .frame(maxWidth: 520)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                .fill(Theme.surface.opacity(0.94))
                .background(.ultraThinMaterial, in: UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous))
                .overlay(alignment: .top) {
                    UnevenRoundedRectangle(topLeadingRadius: 32, topTrailingRadius: 32, style: .continuous)
                        .strokeBorder(Theme.border)
                }
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private var signInForm: some View {
        VStack(spacing: 12) {
            LoginField(placeholder: "E-mail", text: $email, kind: .email)
                .focused($focus, equals: .email)
                .submitLabel(.next)
                .onSubmit { focus = .password }
            LoginField(placeholder: "Parolă", text: $password, kind: .password)
                .focused($focus, equals: .password)
                .submitLabel(.go)
                .onSubmit { Task { await signIn() } }
            Button { Task { await signIn() } } label: { label("Intră în cont") }
                .buttonStyle(.ktPrimaryWide)
                .disabled(busy || email.isEmpty || password.isEmpty)
                .padding(.top, 4)
            Button("Ai uitat parola?") { switchTo(.forgot) }
                .font(.ktBodyEmphasis).foregroundStyle(Theme.accent)
                .padding(.top, 6)
            if let notice {
                Text(notice).font(.ktFootnote).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            }
            Text("Doar cu invitație. Cere-i lui Sorin un cont.")
                .font(.ktFootnote).foregroundStyle(Theme.muted)
                .padding(.top, 2)
        }
    }

    private func newPasswordForm(session: String, username: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Alege o parolă").font(.ktTitle)
            Text("Ai intrat cu parola din invitație. Alege una a ta, pe care o vei folosi de acum.")
                .font(.ktCallout).foregroundStyle(Theme.muted)
            LoginField(placeholder: "Parolă nouă", text: $newPassword, kind: .newPassword)
                .focused($focus, equals: .newPassword)
                .submitLabel(.go)
                .onSubmit { Task { await completeNewPassword(session: session, username: username) } }
            Button { Task { await completeNewPassword(session: session, username: username) } } label: { label("Salvează și intră") }
                .buttonStyle(.ktPrimaryWide)
                .disabled(busy || newPassword.count < 8)
            Text("Cel puțin 8 caractere, cu literă mare, literă mică, cifră și simbol.")
                .font(.ktFootnote).foregroundStyle(Theme.muted).frame(maxWidth: .infinity)
        }
        .foregroundStyle(Theme.text)
    }

    private var forgotForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ai uitat parola?").font(.ktTitle)
            Text("Îți trimitem un cod pe e-mail ca să alegi o parolă nouă.")
                .font(.ktCallout).foregroundStyle(Theme.muted)
            LoginField(placeholder: "E-mail", text: $email, kind: .email)
                .focused($focus, equals: .email)
                .submitLabel(.send)
                .onSubmit { Task { await sendCode() } }
            Button { Task { await sendCode() } } label: { label("Trimite codul") }
                .buttonStyle(.ktPrimaryWide)
                .disabled(busy || email.isEmpty)
            Button("Înapoi la intrare") { switchTo(.signIn) }
                .font(.ktBodyEmphasis).foregroundStyle(Theme.accent).frame(maxWidth: .infinity)
                .padding(.top, 4)
        }
        .foregroundStyle(Theme.text)
    }

    private var codeForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Verifică e-mailul").font(.ktTitle)
            Text("Am trimis un cod la \(email.isEmpty ? "adresa ta" : email). Scrie-l aici.")
                .font(.ktCallout).foregroundStyle(Theme.muted)
            CodeField(code: $code)
                .focused($focus, equals: .code)
            LoginField(placeholder: "Parolă nouă", text: $newPassword, kind: .newPassword)
                .focused($focus, equals: .newPassword)
                .submitLabel(.go)
                .onSubmit { Task { await confirmCode() } }
            Button { Task { await confirmCode() } } label: { label("Schimbă parola") }
                .buttonStyle(.ktPrimaryWide)
                .disabled(busy || code.count != 6 || newPassword.count < 8)
            Button("Trimite din nou codul") { Task { await sendCode() } }
                .font(.ktBodyEmphasis).foregroundStyle(Theme.accent).frame(maxWidth: .infinity)
                .padding(.top, 4)
        }
        .foregroundStyle(Theme.text)
    }

    private func label(_ text: String) -> some View {
        ZStack {
            Text(text).opacity(busy ? 0 : 1)
            if busy { ProgressView().tint(Theme.onAccent) }
        }
    }

    // MARK: Actions

    private func switchTo(_ next: Mode) {
        error = nil
        notice = nil
        mode = next
    }

    private func run(_ work: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await work()
        } catch {
            Haptics.warning()
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func signIn() async {
        await run {
            switch try await auth.signIn(email: email, password: password) {
            case .done:
                Haptics.success()
            case .newPasswordRequired(let session, let username):
                newPassword = ""
                mode = .newPassword(session: session, username: username)
                focus = .newPassword
            }
        }
    }

    private func completeNewPassword(session: String, username: String) async {
        await run {
            try await auth.completeNewPassword(session: session, username: username, newPassword: newPassword)
            Haptics.success()
        }
    }

    private func sendCode() async {
        await run {
            try await auth.forgotPassword(email: email)
            code = ""
            newPassword = ""
            mode = .confirmCode
            focus = .code
        }
    }

    private func confirmCode() async {
        await run {
            try await auth.confirmForgotPassword(email: email, code: code, newPassword: newPassword)
            Haptics.success()
            password = ""
            mode = .signIn
            notice = "Parola a fost schimbată. Intră cu parola nouă."
            focus = .password
        }
    }

    /// For the simulator screenshots: `-screen login-new-password` or `-screen login-code`.
    private static var initialMode: Mode {
        #if DEBUG
        switch LaunchOptions.screen {
        case "login-new-password": return .newPassword(session: "demo", username: "demo")
        case "login-code": return .confirmCode
        default: return .signIn
        }
        #else
        return .signIn
        #endif
    }
}

/// The night scene behind the sheet: gold glow, stars, the icon and the app's name.
struct LoginScene: View {
    var compact: Bool
    var greeting: String?

    private struct Star {
        let x: CGFloat, y: CGFloat, size: CGFloat, opacity: Double
        init(_ i: Int) {
            let tier = Double(i % 3)
            x = CGFloat((i * 37 + 11) % 100) / 100
            y = CGFloat((i * 53 + 7) % 46 + 4) / 100
            size = CGFloat(tier * 1.2 + 2.2)
            opacity = 0.35 + tier * 0.2
        }
    }

    private static let stars: [Star] = (0..<14).map(Star.init)

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                LinearGradient(colors: [Color(hex: 0x2A2236), Theme.background], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.62))
                RadialGradient(colors: [Theme.accent.opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: compact ? 0.16 : 0.26),
                               startRadius: 0, endRadius: geo.size.width * 0.7)
                ForEach(Self.stars.indices, id: \.self) { i in
                    let s = Self.stars[i]
                    Circle().fill(.white).opacity(s.opacity)
                        .frame(width: s.size, height: s.size)
                        .position(x: s.x * geo.size.width, y: s.y * geo.size.height)
                }
                VStack(spacing: compact ? 10 : 18) {
                    Image("LoginIcon")
                        .resizable()
                        .frame(width: compact ? 80 : 112, height: compact ? 80 : 112)
                        .clipShape(RoundedRectangle(cornerRadius: compact ? 19 : 26, style: .continuous))
                        .shadow(color: Theme.accent.opacity(0.35), radius: 30)
                        .shadow(color: .black.opacity(0.5), radius: 14, y: 8)
                        .accessibilityHidden(true)
                    VStack(spacing: 8) {
                        Text(greeting ?? "Bucătăria\ncu povești")
                            .font(compact ? .ktTitle : .ktLargeTitle)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Theme.text)
                        if !compact {
                            Text("Rețete și povești pentru acasă").font(.ktCallout).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .padding(.top, geo.size.height * (compact ? 0.12 : 0.14))
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea(.keyboard)
    }
}

/// A rounded dark input with the right keyboard and iCloud Keychain autofill.
struct LoginField: View {
    enum Kind { case email, password, newPassword }
    let placeholder: String
    @Binding var text: String
    let kind: Kind
    @State private var reveal = false

    var body: some View {
        HStack(spacing: 10) {
            Group {
                switch kind {
                case .email:
                    TextField("", text: $text, prompt: prompt)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                case .password, .newPassword:
                    if reveal {
                        TextField("", text: $text, prompt: prompt)
                    } else {
                        SecureField("", text: $text, prompt: prompt)
                    }
                }
            }
            .textContentType(kind == .password ? .password : kind == .newPassword ? .newPassword : .username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .font(.ktBody)
            .foregroundStyle(Theme.text)
            if kind != .email {
                Button { reveal.toggle() } label: {
                    Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel(reveal ? "Ascunde parola" : "Arată parola")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
    }

    private var prompt: Text { Text(placeholder).foregroundStyle(Color(hex: 0x8A8179)) }
}

/// Six boxes for the e-mailed code; iOS offers the code from Mail above the keyboard.
struct CodeField: View {
    @Binding var code: String

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .foregroundStyle(.clear)
                .tint(.clear)
                .onChange(of: code) { _, next in
                    let digits = String(next.filter(\.isNumber).prefix(6))
                    if digits != next { code = digits }
                }
                .accessibilityLabel("Cod din e-mail")
            HStack(spacing: 8) {
                ForEach(0..<6, id: \.self) { i in
                    box(i)
                }
            }
            .allowsHitTesting(false)
        }
    }

    private func box(_ i: Int) -> some View {
        let chars = Array(code)
        let digit: String = i < chars.count ? String(chars[i]) : ""
        let edge: Color
        if i < chars.count { edge = Theme.accent } else if i == chars.count { edge = Theme.accent.opacity(0.5) } else { edge = Theme.border }
        return Text(digit)
            .font(.custom(AppFont.bodySemibold, size: 24, relativeTo: .title2))
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(edge))
    }
}
