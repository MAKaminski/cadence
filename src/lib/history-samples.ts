// Two small, invented exports in the real ChatGPT and Claude shapes, for demo mode, unit tests and the
// end-to-end test. The person is the fictional demo persona (src/lib/demo-persona.ts); none of this is
// anyone's real data. Each includes the awkward parts real exports have: hidden and system nodes, image
// parts, code, assistant replies, an empty `text` beside `content`, and a message repeated across chats.

const t = (iso: string) => Date.parse(iso) / 1000;

const ABOUT_ME = "I'm a fractional CFO for three climate-tech startups. Before that I was controller at Northwind Solar. I'm based in Denver.";
const POST = [
  "I closed the books for a new client in five days this month, the first month we worked together.",
  "",
  "Nothing clever happened. We agreed on day one what good enough by day five meant, line by line, and nobody waited for a perfect number.",
  "",
  "Most month-end close problems are decisions nobody made, not tools anybody lacks. Make the decision first and the speed follows.",
].join("\n");

/** One ChatGPT `mapping` thread: root -> user/assistant turns. */
function thread(id: string, start: number, turns: { role: string; content: Record<string, unknown>; meta?: Record<string, unknown> }[]) {
  const mapping: Record<string, unknown> = { [`${id}-root`]: { id: `${id}-root`, message: null, parent: null, children: [`${id}-0`] } };
  turns.forEach((x, i) => {
    mapping[`${id}-${i}`] = {
      id: `${id}-${i}`, parent: i ? `${id}-${i - 1}` : `${id}-root`, children: i < turns.length - 1 ? [`${id}-${i + 1}`] : [],
      message: { id: `${id}-m${i}`, author: { role: x.role, name: null, metadata: {} }, create_time: start + i * 60, content: x.content, status: "finished_successfully", metadata: x.meta ?? {} },
    };
  });
  return mapping;
}
const said = (text: string) => ({ role: "user", content: { content_type: "text", parts: [text] } });
const reply = (text: string) => ({ role: "assistant", content: { content_type: "text", parts: [text] } });

export const SAMPLE_CHATGPT = [
  {
    title: "Seed model structure", create_time: t("2026-06-02T14:00:00Z"), update_time: t("2026-06-02T14:30:00Z"), conversation_id: "demo-c1", current_node: "c1-4",
    mapping: thread("c1", t("2026-06-02T14:00:00Z"), [
      { role: "user", content: { content_type: "user_editable_context", user_profile: ABOUT_ME, user_instructions: "Be brief." }, meta: { is_visually_hidden_from_conversation: true } },
      said("I run finance for a heat-pump installer and two battery startups. How should I structure a 13-week cash model for a seed-stage climate-tech startup?"),
      reply("Start from the opening bank balance and roll forward weekly…"),
      said("I've been a CPA since 2015, so skip the accounting basics. I care about cash runway, not revenue."),
      reply("Understood. Focus the model on cash runway…"),
    ]),
  },
  {
    title: "Subsidy timing", create_time: t("2026-07-10T09:00:00Z"), conversation_id: "demo-c2", current_node: "c2-5",
    mapping: thread("c2", t("2026-07-10T09:00:00Z"), [
      { role: "system", content: { content_type: "text", parts: [""] }, meta: { is_user_system_message: true, user_context_message_data: { about_user_message: ABOUT_ME, about_model_message: "Be brief." } } },
      said("A founder asked how to model heat-pump subsidies before they're approved. My answer is to model the timing, not the amount. I should write a post about modelling subsidies by timing, not amount."),
      reply("That's a strong angle…"),
      { role: "user", content: { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer", asset_pointer: "file-service://file-demo", size_bytes: 1200 }, "Here's the cash runway chart from the board deck for climate-tech startups; does the scale read clearly?"] } },
      { role: "user", content: { content_type: "code", language: "python", text: "df = pd.read_csv('cash.csv')" } },
      reply("The scale is fine…"),
    ]),
  },
  {
    title: "Draft: closing the books", create_time: t("2026-08-21T16:00:00Z"), conversation_id: "demo-c3",
    mapping: thread("c3", t("2026-08-21T16:00:00Z"), [
      said(POST),
      reply("This reads well. You could open with the number…"),
      said("Please don't mention Contoso, they're a client under NDA."),
      said("thanks!"),
    ]),
  },
  { title: "Malformed on purpose", create_time: "not a number", mapping: { x: { message: { author: null } }, y: null } },
];

export const SAMPLE_CLAUDE = [
  {
    uuid: "demo-k1", name: "Grid interconnection queues", summary: "", created_at: "2026-09-03T10:00:00.000Z", updated_at: "2026-09-03T10:20:00.000Z", account: { uuid: "demo" },
    chat_messages: [
      {
        uuid: "k1-1", sender: "human", text: "", created_at: "2026-09-03T10:00:00.000Z",
        content: [{ type: "text", text: "I help climate-tech startups forecast revenue when grid interconnection queues keep slipping. My clients keep missing revenue forecasts because of interconnection queue delays.", citations: [] }],
        attachments: [{ file_name: "queue.csv", file_type: "text/csv", file_size: 2000, extracted_content: "project,queue_date\nA,2024-01-01" }], files: [],
      },
      { uuid: "k1-2", sender: "assistant", text: "Interconnection delays…", content: [{ type: "text", text: "Interconnection delays…" }], created_at: "2026-09-03T10:01:00.000Z" },
      { uuid: "k1-3", sender: "human", text: "I'm thinking about writing a post about why interconnection queues wreck revenue forecasts for climate-tech startups.", created_at: "2026-09-03T10:05:00.000Z" },
    ],
  },
  {
    uuid: "demo-k2", name: "Fundraising prep", created_at: "2026-09-15T12:00:00.000Z",
    chat_messages: [
      { uuid: "k2-1", sender: "human", content: "I helped raise a $6M seed round for a heat-pump installer last year, and fundraising prep is half my work now.", created_at: "2026-09-15T12:00:00.000Z" },
      { uuid: "k2-2", sender: "human", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Never write about my kids. Keep family out of anything public." }], created_at: "2026-09-15T12:02:00.000Z" },
      // The same words as in the ChatGPT export: kept once.
      { uuid: "k2-3", sender: "human", text: "I've been a CPA since 2015, so skip the accounting basics. I care about cash runway, not revenue.", created_at: "2026-09-15T12:03:00.000Z" },
      { uuid: "k2-4", sender: "assistant", content: [{ type: "tool_use", name: "artifacts", input: { content: "…" } }] },
    ],
  },
  "not a conversation",
];
