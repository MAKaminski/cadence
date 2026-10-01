// Settings: the annual-billing math, profile photo uploads (typed by bytes, cropped square, location
// stripped) and, against a real Postgres, that a photo stays with its owner.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { annualQuote, usd, ANNUAL_DISCOUNT, MONTHLY_PRICE_CENTS } from "@/lib/billing";
import { AVATAR, squareAvatar } from "@/lib/avatar";

describe("annual billing", () => {
  it("is twelve months at 20% off, and says what that saves", () => {
    expect(ANNUAL_DISCOUNT).toBe(0.2);
    expect(annualQuote(MONTHLY_PRICE_CENTS)).toEqual({ monthlyCents: 2000, fullYearCents: 24000, annualCents: 19200, savingCents: 4800, percentOff: 20 });
  });

  it("uses Stripe's actual yearly price when it's known, so the saving shown is the saving charged", () => {
    expect(annualQuote(2000, 19900)).toMatchObject({ annualCents: 19900, savingCents: 4100, percentOff: 17 });
    expect(annualQuote(2000, 30000).savingCents).toBe(0); // never a negative saving
  });

  it("formats whole dollars without cents", () => {
    expect([usd(2000), usd(19200), usd(1950), usd(123456)]).toEqual(["$20", "$192", "$19.50", "$1,234.56"]);
  });
});

const image = (width: number, height: number, format: "png" | "jpeg" | "webp" | "gif", meta = false) => {
  const s = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 80 } } });
  return (meta ? s.withExif({ IFD0: { Copyright: "secret-location" } }) : s).toFormat(format).toBuffer();
};

describe("profile photo uploads", () => {
  it("crops any PNG, JPEG or WebP to a 256 × 256 WebP", async () => {
    for (const f of ["png", "jpeg", "webp"] as const) {
      const out = await squareAvatar(await image(640, 360, f));
      const m = await sharp(out).metadata();
      expect([m.format, m.width, m.height], f).toEqual(["webp", AVATAR.size, AVATAR.size]);
    }
  });

  it("drops the photo's metadata (camera, location)", async () => {
    const out = await squareAvatar(await image(300, 300, "jpeg", true));
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.includes(Buffer.from("secret-location"))).toBe(false);
  });

  it("refuses other types by their bytes, whatever the file is called, and anything over 2 MB", async () => {
    await expect(squareAvatar(await image(10, 10, "gif"))).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(squareAvatar(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(squareAvatar(Buffer.concat([await image(10, 10, "png"), Buffer.alloc(AVATAR.maxBytes)]))).rejects.toThrow(/2 MB/);
  });

  it("refuses a file that starts like a PNG but isn't one", async () => {
    const fake = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("not really an image")]);
    await expect(squareAvatar(fake)).rejects.toThrow(/couldn't be read/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("profile photos are per user", () => {
  let mod: typeof import("@/db"), s: typeof import("@/db/schema"), svc: typeof import("@/services/avatar");
  const A = `av-a-${Date.now()}`, B = `av-b-${Date.now()}`;

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: url });
    mod = await import("@/db"); s = await import("@/db/schema"); svc = await import("@/services/avatar");
    for (const id of [A, B]) await mod.db.insert(s.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false, image: "https://media.licdn.com/p.jpg" });
  });
  afterAll(async () => { await mod.db.delete(s.user).where(sql`${s.user.id} in (${A}, ${B})`); });

  it("shows the LinkedIn photo until one is uploaded, then the upload, only to its owner", async () => {
    expect(await svc.avatarFor({ id: A, image: "https://media.licdn.com/p.jpg" })).toEqual({ src: "https://media.licdn.com/p.jpg", uploaded: false, linkedin: "https://media.licdn.com/p.jpg" });
    const { version } = await svc.setAvatar(A, await image(400, 300, "png"));
    expect((await svc.avatarFor({ id: A, image: null })).src).toBe(`/app/settings/photo?v=${version}`);
    expect((await svc.getAvatar(A))?.mime).toBe("image/webp");
    expect(await svc.getAvatar(B)).toBeNull();
    expect(await mod.asUser(B, (tx) => tx.select().from(s.userAvatars))).toEqual([]);
    // B can't overwrite or delete A's photo, even naming A.
    await expect(mod.asUser(B, (tx) => tx.insert(s.userAvatars).values({ userId: A, mime: "image/webp", bytes: 1, data: Buffer.from("x") }))).rejects.toThrow();
    await mod.asUser(B, (tx) => tx.delete(s.userAvatars).where(sql`user_id = ${A}`));
    expect(await svc.getAvatar(A)).not.toBeNull();
  });

  it("an email sign-up that connects LinkedIn gets its LinkedIn photo, without ever overwriting one", async () => {
    const C = `av-c-${Date.now()}`;
    await mod.db.insert(s.user).values({ id: C, name: C, email: `${C}@example.com`, emailVerified: true });
    const asked: string[] = [];
    const linkedin = (body: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    try {
      // LinkedIn says no, or offers something that isn't an https picture: nothing changes, nothing throws.
      expect(await svc.fillLinkedInPhoto(C, async () => "tok", linkedin({}, 401))).toBe(false);
      expect(await svc.fillLinkedInPhoto(C, async () => "tok", linkedin({ picture: "javascript:alert(1)" }))).toBe(false);
      expect(await svc.fillLinkedInPhoto(C, async () => { throw new Error("token gone"); }, linkedin({}))).toBe(false);
      // The first good answer fills it in, using the account's token.
      expect(await svc.fillLinkedInPhoto(C, async () => "tok", linkedin({ picture: "https://media.licdn.com/c.jpg" }))).toBe(true);
      expect(asked.at(-1)).toBe("https://api.linkedin.com/v2/userinfo Bearer tok");
      const [c] = await mod.db.select({ image: s.user.image }).from(s.user).where(sql`id = ${C}`);
      expect(c.image).toBe("https://media.licdn.com/c.jpg");
      // Once there's a photo, later sign-ins leave it alone and don't even ask LinkedIn.
      const n = asked.length;
      expect(await svc.fillLinkedInPhoto(C, async () => "tok", linkedin({ picture: "https://media.licdn.com/other.jpg" }))).toBe(false);
      expect(asked.length).toBe(n);
    } finally {
      await mod.db.delete(s.user).where(sql`${s.user.id} = ${C}`);
    }
  });

  it("'Use my LinkedIn photo' forgets the upload, and deleting the account deletes the photo", async () => {
    await svc.removeAvatar(A);
    expect((await svc.avatarFor({ id: A, image: "https://media.licdn.com/p.jpg" })).uploaded).toBe(false);
    await svc.setAvatar(B, await image(50, 50, "webp"));
    await mod.db.delete(s.user).where(sql`${s.user.id} = ${B}`);
    expect(await mod.db.select().from(s.userAvatars).where(sql`user_id = ${B}`)).toEqual([]);
  });
});
