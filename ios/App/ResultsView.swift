import CadenceCore
import Charts
import SwiftUI

/// The same three views as the web Results page, each with a "how to read this" line and an
/// accessible summary.
struct ResultsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                Section {
                    OutreachChart(weeks: model.outreach)
                } header: { Text("Outreach: posts per week") } footer: {
                    Text("Each bar is a week. Solid bars met your target (the dashed line); faded bars fell short.")
                }
                Section {
                    if let posts = model.impact?.posts, !posts.isEmpty { ImpactChart(posts: posts) }
                    else { Text("Waiting for LinkedIn analytics access. Numbers appear 24 and 72 hours after each post.").foregroundStyle(.secondary) }
                } header: { Text("Impact: reach and engagement") } footer: {
                    Text("Bars are impressions; the line is engagement rate (reactions, comments and reshares per impression).")
                }
                if let works = model.impact?.whatWorks, !works.isEmpty {
                    Section {
                        ForEach(["angle", "weekday", "length"], id: \.self) { dim in
                            let rows = works.filter { $0.dimension.rawValue == dim }.sorted { $0.rate > $1.rate }
                            VStack(alignment: .leading) {
                                Text("By \(dim)").font(.subheadline.weight(.semibold))
                                Chart(rows, id: \.label) { r in
                                    BarMark(x: .value("Engagement", r.rate), y: .value(dim, r.label))
                                        .foregroundStyle(r.label == rows.first?.label ? Color.accentColor : Color.accentColor.opacity(0.45))
                                        .annotation(position: .trailing) { Text(r.rate, format: .percent.precision(.fractionLength(1))).font(.caption2) }
                                }
                                .chartXAxis(.hidden).frame(height: CGFloat(rows.count) * 32 + 8)
                            }
                        }
                    } header: { Text("What works for you") } footer: { Text("Longer bars did better. With only a few posts, treat it as a hint.") }
                }
                if model.impact?.posts.contains(where: \.sample) == true {
                    Section { Label("Sample numbers (demo)", systemImage: "info.circle").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Results")
            .refreshable { await model.refresh() }
        }
    }
}

struct OutreachChart: View {
    let weeks: [OutreachWeek]
    var body: some View {
        let target = weeks.first?.target ?? 0
        Chart {
            ForEach(weeks, id: \.week) { w in
                BarMark(x: .value("Week", day(w.week)), y: .value("Posts", w.posts))
                    .foregroundStyle(w.posts >= target ? Color.accentColor : Color.accentColor.opacity(0.4))
            }
            RuleMark(y: .value("Target", target)).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4])).foregroundStyle(.secondary)
                .annotation(position: .top, alignment: .leading) { Text("Target \(Int(target))/week").font(.caption2).foregroundStyle(.secondary) }
        }
        .chartXAxis { AxisMarks(values: .stride(by: .weekOfYear, count: 3)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated).day()) } }
        .frame(height: 180)
        .accessibilityLabel("Posts per week for the last \(weeks.count) weeks. \(weeks.filter { $0.posts >= target }.count) weeks met the target of \(Int(target)).")
    }
    func day(_ s: String) -> Date { (try? Date(s + "T12:00:00Z", strategy: .iso8601)) ?? .now }
}

struct ImpactChart: View {
    let posts: Impact.PostsPayload
    var body: some View {
        let maxImp = max(posts.map(\.impressions).max() ?? 1, 1)
        let maxRate = max(posts.map(\.rate).max() ?? 0.01, 0.01)
        let best = posts.max { $0.rate < $1.rate }
        VStack(alignment: .leading) {
            Chart(posts, id: \.publicationId) { p in
                BarMark(x: .value("Posted", p.publishedAt), y: .value("Impressions", p.impressions / maxImp))
                    .foregroundStyle(Color.accentColor.opacity(p.publicationId == best?.publicationId ? 0.7 : 0.3))
                LineMark(x: .value("Posted", p.publishedAt), y: .value("Rate", p.rate / maxRate)).foregroundStyle(Color.accentColor)
                    .symbol(.circle)
            }
            .chartYAxis(.hidden).chartXAxis(.hidden).frame(height: 180)
            if let b = best {
                Text("Best post: “\(b.excerpt)” at \(b.rate, format: .percent.precision(.fractionLength(1))) engagement, \(Int(b.impressions)) impressions.").font(.caption)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
