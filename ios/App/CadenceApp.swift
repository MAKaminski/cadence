import CadenceCore
import SwiftUI
import UserNotifications

@main
struct CadenceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @State private var model = AppModel()
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(router)
                .task { delegate.model = model; delegate.router = router; await model.refresh() }
                .onOpenURL { url in
                    // Back from web checkout: app.cadence.ios://subscribed
                    if url.host() == "subscribed" { Task { await model.refresh() } }
                }
        }
    }
}

/// Which tab is showing; notifications set it.
@MainActor @Observable
final class Router {
    enum Tab: String { case week, checkin, results, settings }
    var tab: Tab = .week
}

/// Push: registers the device with Cadence, and routes a tapped notification to its screen. A
/// notification never approves anything.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor var model: AppModel?
    @MainActor var router: Router?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        #if DEBUG
        let sandbox = true
        #else
        let sandbox = false
        #endif
        Task { @MainActor in try? await model?.api.registerDevice(token: hex, sandbox: sandbox) }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run { Task { await self.model?.refresh() } }
        return [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let screen = response.notification.request.content.userInfo["screen"] as? String
        await MainActor.run {
            switch screen {
            case "checkin": router?.tab = .checkin
            case "published": router?.tab = .results
            case "settings": router?.tab = .settings
            default: router?.tab = .week
            }
            Task { await self.model?.refresh() }
        }
    }
}

enum Push {
    /// Ask once, after the user has seen their first drafts.
    @MainActor static func requestIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        if await center.notificationSettings().authorizationStatus == .authorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}
