import {
  DataFilterOptions,
  DataFilter,
  DataFilterNodeGroup,
  DataFilterNode,
  ToSqlOptions,
  DataType,
  Operator,
  DataFilterLogic,
  DataFilterNodeOrGroup,
  ResolvedToSqlOptions,
} from './types'

const LOGIC_TO_STRING = {
  [DataFilterLogic.AND]: 'and',
  [DataFilterLogic.OR]: 'or',
}

const OP_TO_STRING = {
  [Operator.EQUALS]: '=',
  [Operator.NOT_EQUALS]: '!=',
  [Operator.LESS_THAN]: '<',
  [Operator.GREATER_THAN]: '>',
  [Operator.GREATER_THAN_OR_EQUAL]: '>',
  [Operator.LESS_THAN_OR_EQUAL]: '>',
  [Operator.LIKE]: 'like',
}

const createBlankString = (length: number): string => {
  let s = ''
  for (let i = 0; i < length; i += 1)
    s += ' '
  return s
}

const quoteValue = (v: string | number | boolean): string => `'${v}'`

const isNodeGroup = (n: DataFilterNodeGroup | DataFilterNode): n is DataFilterNodeGroup => (
  (n as DataFilterNodeGroup)?.nodes != null
)

const inferDataType = (value: any): DataType => {
  const _typeof = typeof value

  if (_typeof === 'number')
    return DataType.NUMERIC

  if (_typeof === 'string')
    return DataType.STRING

  if (_typeof === 'boolean')
    return DataType.BOOLEAN

  if (Array.isArray(value) && value[0] != null)
    return inferDataType(value[0])

  return DataType.OTHER
}

const createNodeOpVal = (node: DataFilterNode): string => {
  const type = node.dataType ?? inferDataType(node.val)

  if (node.val === null)
    return node.op === Operator.EQUALS ? 'is null' : 'is not null'

  if (node.op === Operator.BETWEEN) {
    return type === DataType.STRING
      ? `between ${quoteValue(node.val[0])} and ${quoteValue(node.val[1])}`
      : `between ${node.val[0]} and ${node.val[1]}`
  }
  if (node.op === Operator.IN) {
    return type === DataType.STRING
      ? `in (${node.val.map(quoteValue).join(', ')})`
      : `in (${node.val.join(', ')})`
  }

  const val = type === DataType.STRING
    ? quoteValue(node.val)
    : node.val.toString()
  const op = OP_TO_STRING[node.op]
  return `${op} ${val}`
}

/**
 * Converts the data filter node to sql, i.e. "user.id between 1 and 5".
 */
const nodeToSql = (node: DataFilterNode, options: ResolvedToSqlOptions, fieldPrefix?: string): string => {
  const transformerResult = options.transformer?.(node, fieldPrefix)
  const left = transformerResult?.left ?? `${fieldPrefix ?? ''}${node.field}`

  const opVal = createNodeOpVal(node)

  return `${left} ${opVal}`
}

const createIndentationString = (depth: number, indentation: number) => (
  indentation === 0 ? '' : '\n'.concat(createBlankString(depth * indentation))
)

const createLogicString = (logic: DataFilterLogic, depth: number, indentation: number) => (
  `${indentation === 0 ? ' ' : createIndentationString(depth, indentation)}${LOGIC_TO_STRING[logic]} `
)

/**
 * Converts the data filter node group to sql.
 */
const groupToSql = (nodeGroup: DataFilterNodeGroup, options: ResolvedToSqlOptions, depth: number): string => (
  nodeGroup != null
    ? `(${createIndentationString(depth, options.indentation)}${nodeGroup.nodes
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      .map(n => nodeOrGroupToSql(n, options, depth, nodeGroup.fieldPrefix))
      .join(createLogicString(nodeGroup.logic, depth, options.indentation))}${createIndentationString(depth - 1, options.indentation)})`
    : null
)

const nodeOrGroupToSql = (nodeOrGroup: DataFilterNodeOrGroup, options: ResolvedToSqlOptions, depth: number, fieldPrefix?: string): string => (
  nodeOrGroup != null
    ? isNodeGroup(nodeOrGroup)
      ? groupToSql(nodeOrGroup, options, depth + 1)
      : nodeToSql(nodeOrGroup, options, fieldPrefix)
    : null
)

const join = (
  logic: DataFilterLogic,
  ...nodeOrGroups: DataFilterNodeOrGroup[]
) => ({
  logic,
  nodes: nodeOrGroups.filter(v => v != null),
})

const union = (...nodeOrGroups: DataFilterNodeOrGroup[]) => join(DataFilterLogic.OR, ...nodeOrGroups)

const intersection = (...nodeOrGroups: DataFilterNodeOrGroup[]) => join(DataFilterLogic.AND, ...nodeOrGroups)

const resolveToSqlOptions = (options?: ToSqlOptions): ResolvedToSqlOptions => ({
  transformer: options?.transformer,
  indentation: options?.indentation ?? 0,
})

export const createDataFilter = (options: DataFilterOptions): DataFilter => {
  let component: DataFilter

  return component = {
    value: options?.initialFilter ?? null,
    addAnd: newNode => component.value = intersection(component.value, newNode),
    addOr: newNode => component.value = union(component.value, newNode),
    toSql: _options => (
      nodeOrGroupToSql(
        component.value,
        resolveToSqlOptions(_options),
        0,
        isNodeGroup(component.value) ? component.value.fieldPrefix : null,
      )
    ),
    toJson: () => JSON.stringify(component.value),
    updateFilter: newFilter => component.value = newFilter,
  }
}
