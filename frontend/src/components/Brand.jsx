import { Link } from "react-router-dom";

export default function Brand({ onClick }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="NFL Pick 5 home"
      className="shrink-0 text-2xl font-black tracking-tighter text-white"
    >
      PICK<span className="text-gold">5</span>
    </Link>
  );
}
