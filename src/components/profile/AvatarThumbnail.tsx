function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AvatarThumbnail({
  url,
  name,
  size = 40,
  className = "",
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold overflow-hidden shrink-0 ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.4 }}>{initialsOf(name)}</span>
      )}
    </div>
  );
}
