"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { CATEGORIES, ROLES, SKILLS, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, type ProfileState } from "@/app/me/profile/actions";
import type { Profile } from "@/lib/supabase/profile";

export function ProfileForm({
  profile,
  email,
  next,
}: {
  profile: Profile;
  email: string;
  next: string;
}) {
  const [state, formAction] = useActionState(updateProfile, null as ProfileState);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(profile.role ?? "client");
  const [uploadError, setUploadError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("avatar");
    setUploadError("");

    if (file instanceof File && file.size > 0) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const type =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "";
      if (!type || file.size > 5 * 1024 * 1024) {
        setUploadError("이미지는 jpg, png, webp 파일이며 5MB 이하여야 합니다.");
        return;
      }
      const supabase = createClient();
      const path = `${profile.id}/avatar.${ext === "jpeg" ? "jpg" : ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: type });
      if (error) {
        setUploadError("이미지를 올리지 못했습니다. 로그인한 뒤 다시 시도해 주세요.");
        return;
      }
      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      data.set("avatar_url", `${publicUrl.publicUrl}?v=${Date.now()}`);
    }
    data.delete("avatar");
    startTransition(() => {
      formAction(data);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="avatar_url" defaultValue={profile.avatar_url ?? ""} />
      <p className="text-sm text-slate-600">이메일 {email} · 여기서는 바꿀 수 없습니다.</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">역할</legend>
        <div className="flex gap-4">
          {ROLES.map((item) => (
            <label key={item.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="role"
                value={item.value}
                checked={role === item.value}
                onChange={() => setRole(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="이름" name="name" required defaultValue={profile.name ?? ""} maxLength={40} />
      <label className="block text-sm font-medium text-slate-800">
        소개
        <textarea
          name="bio"
          defaultValue={profile.bio ?? ""}
          maxLength={1000}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        프로필 이미지
        <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" />
      </label>
      {profile.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
      )}
      {role === "client" ? (
        <>
          <Field label="회사 이름" name="company_name" defaultValue={profile.company_name ?? ""} />
          <Field label="업종" name="business_field" defaultValue={profile.business_field ?? ""} />
          <Field label="웹사이트" name="website" defaultValue={profile.website ?? ""} placeholder="https://" />
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-slate-800">
            분야
            <select
              name="category"
              defaultValue={profile.category ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">선택 안 함</option>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">기술</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {SKILLS.map((skill) => (
                <label key={skill} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="skills" value={skill} defaultChecked={profile.skills?.includes(skill)} />
                  {skill}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="경력 연수" name="career_years" defaultValue={profile.career_years?.toString() ?? ""} inputMode="numeric" />
          <Field label="시간당 금액 (원)" name="hourly_rate" defaultValue={profile.hourly_rate?.toString() ?? ""} inputMode="numeric" />
          <Field label="포트폴리오 주소" name="portfolio_url" defaultValue={profile.portfolio_url ?? ""} placeholder="https://" />
        </>
      )}
      {(state?.message || uploadError) && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{uploadError || state?.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  maxLength,
  placeholder,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <input
        name={name}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
