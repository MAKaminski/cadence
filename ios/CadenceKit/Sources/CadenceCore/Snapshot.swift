import Foundation

/// What the widget shows, written by the app to the shared App Group whenever it refreshes (and when a
/// push arrives). The widget never calls the network itself.
public struct WidgetSnapshot: Codable, Sendable, Equatable {
    public var postsThisWeek: Int
    public var target: Int
    public var nextPostAt: Date?
    public var nextPostLine: String?
    public var waitingForYou: Int
    public var updatedAt: Date

    public init(postsThisWeek: Int, target: Int, nextPostAt: Date?, nextPostLine: String?, waitingForYou: Int, updatedAt: Date = .now) {
        self.postsThisWeek = postsThisWeek; self.target = target; self.nextPostAt = nextPostAt
        self.nextPostLine = nextPostLine; self.waitingForYou = waitingForYou; self.updatedAt = updatedAt
    }

    public static let placeholder = WidgetSnapshot(postsThisWeek: 2, target: 3, nextPostAt: .now.addingTimeInterval(86_400), nextPostLine: "Most founders model revenue first. Model cash first.", waitingForYou: 1)

    static let key = "widget-snapshot"
    public static func load(_ defaults: UserDefaults? = UserDefaults(suiteName: CadenceConfig.appGroup)) -> WidgetSnapshot? {
        defaults?.data(forKey: key).flatMap { try? JSONDecoder().decode(WidgetSnapshot.self, from: $0) }
    }
    public func save(_ defaults: UserDefaults? = UserDefaults(suiteName: CadenceConfig.appGroup)) {
        defaults?.set(try? JSONEncoder().encode(self), forKey: Self.key)
    }
}
