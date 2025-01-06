export type Value<V> = {
  value: V;
} | {
  errorMessage: string;
};
