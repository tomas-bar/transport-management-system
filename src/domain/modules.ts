export const moduleCatalog = {
  operations: { label: 'Reisai ir užsakymai', requires: [] },
  finance: { label: 'Reiso finansai', requires: ['operations'] },
  photos: { label: 'Užsakymų nuotraukos', requires: ['operations'] },
  maintenance: { label: 'Transporto priminimai', requires: ['operations'] },
  freight: { label: 'Krovinių paieška', requires: ['operations'] },
} as const;
export type ModuleId = keyof typeof moduleCatalog;
export function validateModules(input: unknown): ModuleId[] {
  if (!Array.isArray(input) || input.some(id => typeof id !== 'string' || !Object.hasOwn(moduleCatalog, id))) throw new Error('Netinkamas modulių sąrašas.');
  const modules = [...new Set(input)] as ModuleId[];
  if (!modules.includes('operations')) throw new Error('Reisų ir užsakymų modulis būtinas.');
  for (const id of modules) for (const dependency of moduleCatalog[id].requires) {
    if (!modules.includes(dependency)) throw new Error('Pirmiausia įjunkite susijusius modulius.');
  }
  return modules;
}
