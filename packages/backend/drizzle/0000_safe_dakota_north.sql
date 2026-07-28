CREATE TABLE "v4_external_learning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(42) NOT NULL,
	"provider" varchar(66) NOT NULL,
	"external_id" varchar(66) NOT NULL,
	"progress" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'IN_PROGRESS',
	"last_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "v4_external_learning_address_provider_external_id_unique" UNIQUE("address","provider","external_id")
);
