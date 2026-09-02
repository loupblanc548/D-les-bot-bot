import { describe, it, expect } from "vitest";
import { evaluateMathExpression, tryEvaluateMathExpression } from "./safeMathEval.js";

describe("safeMathEval", () => {
  describe("arithmétique", () => {
    it("évalue les opérations de base", () => {
      expect(evaluateMathExpression("1+2")).toBe(3);
      expect(evaluateMathExpression("10-4")).toBe(6);
      expect(evaluateMathExpression("3*4")).toBe(12);
      expect(evaluateMathExpression("10/4")).toBe(2.5);
      expect(evaluateMathExpression("10%3")).toBe(1);
    });

    it("respecte la précédence des opérateurs", () => {
      expect(evaluateMathExpression("2+3*4")).toBe(14);
      expect(evaluateMathExpression("(2+3)*4")).toBe(20);
      expect(evaluateMathExpression("2-3-4")).toBe(-5);
      expect(evaluateMathExpression("100/10/2")).toBe(5);
    });

    it("gère les puissances, associatives à droite", () => {
      expect(evaluateMathExpression("2^3")).toBe(8);
      expect(evaluateMathExpression("2**3")).toBe(8);
      expect(evaluateMathExpression("2^3^2")).toBe(512);
      expect(evaluateMathExpression("2*3^2")).toBe(18);
    });

    it("gère l'unaire et les décimaux", () => {
      expect(evaluateMathExpression("-5+3")).toBe(-2);
      expect(evaluateMathExpression("-(2+3)")).toBe(-5);
      expect(evaluateMathExpression("0.5+.25")).toBe(0.75);
      expect(evaluateMathExpression("1e3")).toBe(1000);
    });

    it("ignore les espaces", () => {
      expect(evaluateMathExpression("  2  +  3 * 4 ")).toBe(14);
    });
  });

  describe("variables et constantes", () => {
    it("substitue les variables", () => {
      expect(evaluateMathExpression("2*x", { x: 5 })).toBe(10);
      expect(evaluateMathExpression("x^2+y", { x: 3, y: 1 })).toBe(10);
    });

    it("expose pi et e", () => {
      expect(evaluateMathExpression("pi")).toBeCloseTo(Math.PI);
      expect(evaluateMathExpression("e")).toBeCloseTo(Math.E);
    });

    it("donne la priorité aux variables sur les constantes", () => {
      expect(evaluateMathExpression("e", { e: 42 })).toBe(42);
    });
  });

  describe("fonctions", () => {
    it("évalue les fonctions mathématiques usuelles", () => {
      expect(evaluateMathExpression("sqrt(16)")).toBe(4);
      expect(evaluateMathExpression("abs(-3)")).toBe(3);
      expect(evaluateMathExpression("sin(0)")).toBe(0);
      expect(evaluateMathExpression("ln(1)")).toBe(0);
      expect(evaluateMathExpression("log(100)")).toBe(2);
      expect(evaluateMathExpression("floor(2.7)")).toBe(2);
    });

    it("accepte une expression en argument", () => {
      expect(evaluateMathExpression("sqrt(4*4)")).toBe(4);
      expect(evaluateMathExpression("2*sin(0)+1")).toBe(1);
    });
  });

  describe("refus du code arbitraire", () => {
    // C'est le point de la classe: aucune de ces entrées ne doit s'exécuter.
    const hostile = [
      "process.exit(1)",
      "require('child_process').execSync('id')",
      "globalThis.process.mainModule",
      "constructor.constructor('return 1')()",
      "(function(){return 1})()",
      "[].map(x=>x)",
      "1;console.log(2)",
      "this",
      "import('fs')",
      "x=1",
      "`${1}`",
    ];

    for (const input of hostile) {
      it(`rejette ${input}`, () => {
        expect(() => evaluateMathExpression(input, { x: 1 })).toThrow();
      });
    }

    it("rejette un identifiant inconnu", () => {
      expect(() => evaluateMathExpression("foo+1")).toThrow(/Identifiant inconnu/);
    });

    it("rejette une fonction inconnue", () => {
      expect(() => evaluateMathExpression("hack(1)")).toThrow(/Fonction inconnue/);
    });

    it("rejette une expression vide", () => {
      expect(() => evaluateMathExpression("   ")).toThrow(/vide/);
    });

    it("rejette une expression trop longue", () => {
      expect(() => evaluateMathExpression("1+".repeat(400) + "1")).toThrow(/trop longue/);
    });

    it("rejette des parenthèses déséquilibrées", () => {
      expect(() => evaluateMathExpression("(1+2")).toThrow();
    });
  });

  describe("tryEvaluateMathExpression", () => {
    it("renvoie la valeur quand l'expression est valide", () => {
      expect(tryEvaluateMathExpression("x*2", { x: 4 }, -1)).toBe(8);
    });

    it("renvoie le fallback sur erreur", () => {
      expect(tryEvaluateMathExpression("nope(", { x: 1 }, -1)).toBe(-1);
    });

    it("renvoie le fallback sur résultat non fini", () => {
      expect(tryEvaluateMathExpression("1/0", {}, -1)).toBe(-1);
      expect(tryEvaluateMathExpression("sqrt(-1)", {}, -1)).toBe(-1);
    });
  });
});
