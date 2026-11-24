"use server";

import { redirect } from "next/navigation";
import { CATEGORIES, ROLES, SKILLS, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { blankToNull, isHttpUrl, safeNext } from "@/lib/supabase/profile";

export type ProfileState = { message: string } | null;

function integerOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

export async function updateProfile(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const next = safeNext(String(formData.get("next") ?? ""), "");
  const role = String(formData.get("role") ?? "");
  if (!ROLES.some((item) => item.value === role)) return { message: "역할을 선택해 주세요." };

  const name = blankToNull(formData.get("name"));
  if (!name || name.length > 40) return { message: "이름은 1자 이상 40자 이하로 적어 주세요." };

  const bio = blankToNull(formData.get("bio"));
  if (bio && bio.length > 1000) return { message: "소개는 1000자 이하로 적어 주세요." };

  const avatarUrl = blankToNull(formData.get("avatar_url"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/me/profile")}`);

  const update: Record<string, unknown> = {
    role: role as UserRole,
    name,
    bio,
    avatar_url: avatarUrl,
  };

  if (role === "client") {
    const website = blankToNull(formData.get("website"));
    if (website && (website.length > 300 || !isHttpUrl(website))) {
      return { message: "웹사이트는 http:// 또는 https:// 로 시작하는 300자 이하 주소여야 합니다." };
    }
    update.company_name = blankToNull(formData.get("company_name"));
    update.business_field = blankToNull(formData.get("business_field"));
    update.website = website;
  } else {
    const category = blankToNull(formData.get("category"));
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return { message: "분야를 목록에서 선택해 주세요." };
    }
    const skills = formData
      .getAll("skills")
      .map(String)
      .filter((skill) => SKILLS.includes(skill as (typeof SKILLS)[number]));
    if (skills.length > 20) return { message: "기술은 20개까지 고를 수 있습니다." };
    const career = integerOrNull(formData.get("career_years"));
    const rate = integerOrNull(formData.get("hourly_rate"));
    if (career === undefined || rate === undefined) {
      return { message: "경력과 시간당 금액은 0 이상의 정수로 적어 주세요." };
    }
    const portfolio = blankToNull(formData.get("portfolio_url"));
    if (portfolio && (portfolio.length > 300 || !isHttpUrl(portfolio))) {
      return { message: "포트폴리오 주소는 http:// 또는 https:// 로 시작해야 합니다." };
    }
    update.category = category;
    update.skills = skills;
    update.career_years = career;
    update.hourly_rate = rate;
    update.portfolio_url = portfolio;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { message: "프로필을 저장하지 못했습니다. 입력값을 다시 확인해 주세요." };
  if (next) redirect(next);
  return { message: "저장했습니다." };
}
