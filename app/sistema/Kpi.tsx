"use client";

import { Ic, ico } from "@/lib/ui";
import { formatar, type Derivado } from "./types";

interface KpiProps {
  icone: string;
  rotulo: string;
  valor: string;
  sufixo?: string;
  nota?: string;
  classe?: string;
}

export function Kpi({
  icone,
  rotulo,
  valor,
  sufixo,
  nota,
  classe = "",
}: KpiProps) {
  return (
    <div className={"kpi " + classe}>
      <div className="kpi-rotulo">
        <Ic d={icone} /> {rotulo}
      </div>

      <div className="kpi-valor">
        {valor}

        {sufixo && (
          <small>{sufixo}</small>
        )}
      </div>

      {nota && (
        <div className="kpi-nota">
          {nota}
        </div>
      )}
    </div>
  );
}

export function Esqueletos() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          className="esqueleto"
          key={i}
        >
          <div className="esqueleto-media" />

          <div className="esqueleto-corpo">
            <div className="esqueleto-barra g" />
            <div className="esqueleto-barra gg" />
            <div className="esqueleto-barra ggg" />
            <div className="esqueleto-barra g" />
          </div>
        </div>
      ))}
    </>
  );
}