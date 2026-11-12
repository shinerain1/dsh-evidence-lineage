import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "evidence-lineage";
export declare const inject: string[];
export interface Config {
    root: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
