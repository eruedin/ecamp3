<?php

namespace App\Tests\Doctrine\Filter;

use ApiPlatform\Core\Api\IriConverterInterface;
use ApiPlatform\Core\Bridge\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use App\Doctrine\Filter\MaterialItemPeriodFilter;
use App\Entity\MaterialItem;
use App\Entity\Period;
use Doctrine\ORM\Query\Expr;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;
use Exception;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class MaterialItemPeriodFilterTest extends TestCase {
    private MockObject|ManagerRegistry $managerRegistryMock;
    private MockObject|QueryBuilder $queryBuilderMock;
    private MockObject|QueryNameGeneratorInterface $queryNameGeneratorInterfaceMock;
    private MockObject|IriConverterInterface $iriConverterMock;

    public function setUp(): void {
        parent::setUp();
        $this->managerRegistryMock = $this->createMock(ManagerRegistry::class);
        $this->queryBuilderMock = $this->createMock(QueryBuilder::class);
        $this->queryNameGeneratorInterfaceMock = $this->createMock(QueryNameGeneratorInterface::class);
        $this->iriConverterMock = $this->createMock(IriConverterInterface::class);

        $this->queryBuilderMock
            ->method('getRootAliases')
            ->willReturn(['o'])
        ;

        $this->queryBuilderMock
            ->method('leftJoin')
            ->will($this->returnSelf())
        ;

        $expr = new Expr();
        $this->queryBuilderMock
            ->method('expr')
            ->will($this->returnValue($expr))
        ;

        $this->queryNameGeneratorInterfaceMock
            ->method('generateParameterName')
            ->willReturnCallback(fn ($field) => $field.'_a1')
        ;
        $this->queryNameGeneratorInterfaceMock
            ->method('generateJoinAlias')
            ->willReturnCallback(fn ($field) => $field.'_j1')
        ;
    }

    public function testGetDescription() {
        // given
        $filter = new MaterialItemPeriodFilter($this->iriConverterMock, $this->managerRegistryMock);

        // when
        $description = $filter->getDescription('Dummy');

        // then
        $this->assertEquals([
            'period' => [
                'property' => 'period',
                'type' => 'string',
                'required' => false,
            ],
        ], $description);
    }

    public function testFailsForResouceClassOtherThanMaterialItem() {
        // given
        $filter = new MaterialItemPeriodFilter($this->iriConverterMock, $this->managerRegistryMock);

        // then
        $this->expectException(Exception::class);
        $this->expectExceptionMessage('MaterialItemPeriodFilter can only be applied to entities of type MaterialItem (received: DummyClass).');

        // when
        $filter->apply($this->queryBuilderMock, $this->queryNameGeneratorInterfaceMock, 'DummyClass', null, ['filters' => [
            'period' => '/period/123',
        ]]);
    }

    public function testDoesNothingForPropertiesOtherThanPeriod() {
        // given
        $filter = new MaterialItemPeriodFilter($this->iriConverterMock, $this->managerRegistryMock);

        // then
        $this->queryBuilderMock
            ->expects($this->never())
            ->method('andWhere')
        ;

        $this->queryBuilderMock
            ->expects($this->never())
            ->method('leftJoin')
        ;

        // when
        $filter->apply($this->queryBuilderMock, $this->queryNameGeneratorInterfaceMock, MaterialItem::class, null, ['filters' => [
            'dummyProperty' => 'abc',
        ]]);
    }

    public function testAddsFilterForPeriodProperty() {
        // given
        $filter = new MaterialItemPeriodFilter($this->iriConverterMock, $this->managerRegistryMock);
        $period = new Period();

        // then
        $this->iriConverterMock
            ->expects($this->once())
            ->method('getItemfromIri')
            ->with('/period/123')
            ->will($this->returnValue($period))
        ;

        $this->queryBuilderMock
            ->expects($this->once())
            ->method('andWhere')
        ;

        $this->queryBuilderMock
            ->expects($this->exactly(5))
            ->method('leftJoin')
        ;

        $this->queryBuilderMock
            ->expects($this->once())
            ->method('setParameter')
            ->with('period_a1', $period)
        ;

        // when
        $filter->apply($this->queryBuilderMock, $this->queryNameGeneratorInterfaceMock, MaterialItem::class, null, ['filters' => [
            'period' => '/period/123',
        ]]);
    }
}