import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto text-center py-20">
      <p className="font-display text-8xl mb-4">404</p>
      <h1 className="heading-b text-3xl mb-3">NO SUCH SQUARE</h1>
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-8">
        That page isn't on the board.
      </p>
      <Link to="/" className="btn-b btn-b-primary inline-block">
        Back to home
      </Link>
    </div>
  );
}
