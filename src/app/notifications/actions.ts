"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/components/applications/server";
import { uuidPattern } from "@/components/applications/model";

export async function readNotification(form: FormData) {
  const { supabase, user } = await requireMember("/notifications");
  const id = String(form.get("notification_id") ?? "");
  if (!uuidPattern.test(id)) redirect("/notifications?error=invalid");
  const { data, error } = await supabase.from("notifications").select("id,link,read_at")
    .eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (error || !data) redirect("/notifications?error=read");
  if (!data.read_at) {
    const { error: updateError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id).is("read_at", null).is("deleted_at", null);
    if (updateError) redirect("/notifications?error=read");
  }
  revalidatePath("/notifications");
  // Link comes from the database, never the submitted form. Still validate it.
  const safeLink = /^\/[\w]/.test(data.link) && !/[\\\u0000-\u0020]/.test(data.link);
  redirect(safeLink ? data.link : "/notifications");
}

export async function readAllNotifications() {
  const { supabase, user } = await requireMember("/notifications");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id).is("read_at", null).is("deleted_at", null);
  if (error) redirect("/notifications?error=read");
  revalidatePath("/notifications");
  redirect("/notifications");
}
