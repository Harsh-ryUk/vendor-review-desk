import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  company: text("company").notNull(),
  status: text("status").notNull(),
  data: text("data").notNull(),
});

export const vendors = sqliteTable("vendors", {
  taxId: text("tax_id").primaryKey(),
  legalName: text("legal_name").notNull(),
  accountKey: text("account_key").notNull(),
  bankCode: text("bank_code").notNull(),
  runId: text("run_id").notNull(),
  createdAt: text("created_at").notNull(),
});
