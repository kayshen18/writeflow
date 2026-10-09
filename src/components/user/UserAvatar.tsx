import { useEffect, useState } from "react";
import { getUploadUrl } from "../../lib/api";

type UserAvatarProps = {
  displayName: string;
  avatarPath: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-3xl",
};

function UserAvatar({
  displayName,
  avatarPath,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] =
    useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarPath]);

  const initial =
    displayName.trim().charAt(0).toUpperCase() ||
    "?";

  const sharedClassName = [
    sizeClasses[size],
    "shrink-0 rounded-full",
    className,
  ].join(" ");

  if (avatarPath && !imageFailed) {
    return (
      <img
        src={getUploadUrl(avatarPath)}
        alt={`${displayName}'s avatar`}
        title={displayName}
        onError={() => setImageFailed(true)}
        className={[
          sharedClassName,
          "object-cover",
        ].join(" ")}
      />
    );
  }

  return (
    <div
      title={displayName}
      className={[
        sharedClassName,
        "flex items-center justify-center bg-[var(--wf-palette-d1fdf5)] font-bold text-[var(--wf-palette-004239)]",
      ].join(" ")}
    >
      {initial}
    </div>
  );
}

export default UserAvatar;
