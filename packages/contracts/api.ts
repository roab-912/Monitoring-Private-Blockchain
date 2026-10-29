import { Type, type Static } from '@sinclair/typebox';

export const Role = Type.Union([Type.Literal('Viewer'), Type.Literal('ContractOperator'), Type.Literal('InfrastructureOperator'), Type.Literal('ValidatorGovernor'), Type.Literal('Administrator')]);
export const ErrorResponse = Type.Object({ error: Type.String() }, { additionalProperties: false });
export const Me = Type.Object({ subject: Type.String(), roles: Type.Array(Role), mode: Type.String() });
export const AuthConfig = Type.Object({ mode: Type.Union([Type.Literal('development'), Type.Literal('oidc')]), issuer: Type.String(), clientId: Type.String(), scope: Type.String() });
export const CheckRequest = Type.Object({ networkId: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export const Operation = Type.Object({
  id: Type.String({ format: 'uuid' }), state: Type.String(), kind: Type.Literal('foundation.check'),
  createdAt: Type.String(), updatedAt: Type.String(), evidence: Type.Union([Type.Null(), Type.Object({
    database: Type.Literal('reachable'), instanceCount: Type.String({ pattern: '^[0-9]+$' }), checkedAt: Type.String(),
  })]),
});
export const Foundation = Type.Object({
  version: Type.Literal('0.0.0'), networkId: Type.String(), chainId: Type.String(),
  machines: Type.Array(Type.Object({ id: Type.String(), name: Type.String(), failureDomain: Type.String() })),
  instances: Type.Array(Type.Object({ id: Type.String(), machineId: Type.String(), serviceName: Type.String(),
    purpose: Type.String(), p2pIdentity: Type.String(), nodeAddress: Type.String(), dataPath: Type.String(),
    ports: Type.Array(Type.Object({ protocol: Type.String(), port: Type.Integer(), purpose: Type.String() })) })),
  physicalFailureDomains: Type.Integer(), warning: Type.String(),
});
export type FoundationDto = Static<typeof Foundation>;
export type OperationDto = Static<typeof Operation>;
