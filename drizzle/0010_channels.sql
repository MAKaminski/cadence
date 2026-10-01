ALTER TYPE "public"."platform" ADD VALUE 'x';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'threads';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'bluesky';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'mastodon';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'pinterest';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'tiktok';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'reddit';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'google_business';--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD COLUMN "drafting" boolean DEFAULT true NOT NULL;