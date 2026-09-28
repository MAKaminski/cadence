import Foundation
import Security

/// Where tokens and the registered client id live. The Keychain in the app; memory in tests.
public protocol SecretStore: Sendable {
    func read(_ key: String) -> Data?
    func write(_ key: String, _ value: Data?)
}

/// Keychain items, readable only when the device is unlocked, shared with the widget via the access group.
public struct KeychainStore: SecretStore {
    let service: String
    public init(service: String = "app.cadence.ios") { self.service = service }

    public func read(_ key: String) -> Data? {
        var out: AnyObject?
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    public func write(_ key: String, _ value: Data?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        guard let value else { return }
        var add = q
        add[kSecValueData as String] = value
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

public final class MemoryStore: SecretStore, @unchecked Sendable {
    private var items: [String: Data] = [:]
    private let lock = NSLock()
    public init() {}
    public func read(_ key: String) -> Data? { lock.withLock { items[key] } }
    public func write(_ key: String, _ value: Data?) { lock.withLock { items[key] = value } }
}
