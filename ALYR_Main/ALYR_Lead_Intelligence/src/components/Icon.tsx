interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className = '' }: IconProps) {
  return (
    <img
      aria-hidden="true"
      className={`icon ${className}`}
      src={`/alyr/icons/${name}.svg`}
      width={size}
      height={size}
      alt=""
    />
  );
}
