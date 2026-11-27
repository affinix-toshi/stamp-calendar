export function Toast({ message }: { message: string }) {
  return (
    <p className="toast" role="alert">
      {message}
    </p>
  );
}
