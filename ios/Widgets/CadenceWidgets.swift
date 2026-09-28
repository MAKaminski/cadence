import CadenceCore
import SwiftUI
import WidgetKit

/// This week at a glance, from the snapshot the app writes. The widget never calls the network; the app
/// reloads it whenever data changes or a notification arrives.
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, snapshot: .placeholder) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now, snapshot: WidgetSnapshot.load() ?? .placeholder)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now, snapshot: WidgetSnapshot.load())], policy: .after(.now.addingTimeInterval(3600))))
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct WeekWidgetView: View {
    let entry: Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let s = entry.snapshot {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(s.postsThisWeek)/\(s.target)").font(.system(.title, design: .rounded).bold().monospacedDigit())
                    Text("this week").font(.caption).foregroundStyle(.secondary)
                }
                if s.waitingForYou > 0 {
                    Label("\(s.waitingForYou) waiting for you", systemImage: "tray.full").font(.caption.weight(.semibold)).foregroundStyle(.tint)
                }
                if family != .systemSmall, let line = s.nextPostLine, let at = s.nextPostAt {
                    Divider()
                    Text("Next: \(at.formatted(.dateTime.weekday(.abbreviated).hour().minute()))").font(.caption2).foregroundStyle(.secondary)
                    Text(line).font(.caption).lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
        } else {
            Text("Open Cadence to sign in.").font(.caption).foregroundStyle(.secondary)
        }
    }
}

@main
struct CadenceWidgets: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "week", provider: Provider()) { entry in
            WeekWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("This week")
        .description("Posts this week against your target, and what's next.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#Preview(as: .systemMedium) { CadenceWidgets() } timeline: { Entry(date: .now, snapshot: .placeholder) }
