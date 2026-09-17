import { __mintRawTokenForTests, __mintTokenForTests } from '../src/share/share-link';

/** 从任意快照对象（含被篡改字段）生成带正确载荷摘要的 token。 */
export async function mintTokenFor(snapshot: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return __mintTokenForTests(bytes);
}

/** 用任意原始字节和摘要生成 token（用于构造无法解压/解析的输入）。 */
export async function mintRawToken(bytes: Uint8Array, digestOf: (b: Uint8Array) => Promise<string>): Promise<string> {
  return __mintRawTokenForTests(bytes, await digestOf(bytes));
}
