import { describe, it, expect } from "vitest";
import {
    categorizeModel,
    groupModelsByCategory,
    type ModelConfig,
} from "../../../packages/ag-quota/src/index";

describe("categorizeModel", () => {
    it("should categorize flash models correctly", () => {
        expect(categorizeModel("gemini-flash")).toBe("Flash");
        expect(categorizeModel("gemini-2.0-flash-exp")).toBe("Flash");
        expect(categorizeModel("Gemini Flash")).toBe("Flash");
    });

    it("should categorize pro/gemini models correctly", () => {
        expect(categorizeModel("gemini-pro")).toBe("Pro");
        expect(categorizeModel("gemini-1.5-pro")).toBe("Pro");
        expect(categorizeModel("Gemini Pro")).toBe("Pro");
        expect(categorizeModel("gemini-ultra")).toBe("Pro"); // "gemini" match
    });

    it("should categorize other models as Claude/GPT", () => {
        expect(categorizeModel("claude-3-5-sonnet")).toBe("Claude/GPT");
        expect(categorizeModel("gpt-4o")).toBe("Claude/GPT");
        expect(categorizeModel("o1-preview")).toBe("Claude/GPT");
        expect(categorizeModel("unknown-model")).toBe("Claude/GPT");
    });
});

describe("groupModelsByCategory", () => {
    it("should group models and find minimum quota per category", () => {
        const models: ModelConfig[] = [
            {
                modelName: "flash-1",
                label: "Gemini Flash 1",
                quotaInfo: { remainingFraction: 0.8 },
            },
            {
                modelName: "flash-2",
                label: "Gemini Flash 2",
                quotaInfo: { remainingFraction: 0.5 }, // Minimum for Flash
            },
            {
                modelName: "pro-1",
                label: "Gemini Pro",
                quotaInfo: { remainingFraction: 0.2 }, // Minimum for Pro
            },
            {
                modelName: "claude-1",
                label: "Claude Sonnet",
                quotaInfo: { remainingFraction: 0.9 },
            },
        ];

        const result = groupModelsByCategory(models);

        expect(result).toHaveLength(3);

        const flash = result.find((c) => c.category === "Flash");
        expect(flash?.remainingFraction).toBe(0.5);

        const pro = result.find((c) => c.category === "Pro");
        expect(pro?.remainingFraction).toBe(0.2);

        const claude = result.find((c) => c.category === "Claude/GPT");
        expect(claude?.remainingFraction).toBe(0.9);
    });

    it("should handle empty list", () => {
        const result = groupModelsByCategory([]);
        expect(result).toEqual([]);
    });
});
