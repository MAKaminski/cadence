import CryptoKit
import Foundation

/// RFC 7636 proof key for the authorization-code flow.
public struct PKCE: Sendable {
    public let verifier: String
    public let challenge: String

    public init(verifier: String = PKCE.randomVerifier()) {
        self.verifier = verifier
        self.challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
    }

    public static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }
}

extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
