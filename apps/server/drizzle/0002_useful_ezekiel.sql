CREATE TYPE "public"."upload_kind" AS ENUM('image', 'avatar');--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "kind" "upload_kind" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "height" integer;